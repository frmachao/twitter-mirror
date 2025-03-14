import { Database } from './database';
import { TwitterClient } from './twitter-client';
import { Logger } from '../utils/logger';
import { Status, isValidStatusTransition, InvalidStatusTransitionError } from '../types/status';
import { Config } from '../types/config';
import { EventBus, ServiceEvent, EventData } from './event-bus';

export class TweetPublisher {
  private prisma: ReturnType<Database['getPrisma']>;
  private twitterClient: TwitterClient;
  private logger: Logger;
  private isProcessing: boolean = false;
  private eventBus: EventBus;

  constructor(private twitterConfig: Config['twitterConfig'][0]) {
    this.prisma = Database.getInstance().getPrisma();
    this.twitterClient = TwitterClient.getInstance(twitterConfig);
    this.logger = new Logger('TweetPublisher');
    this.eventBus = EventBus.getInstance();
    
    // 订阅翻译完成事件
    this.eventBus.subscribe(ServiceEvent.TRANSLATION_COMPLETED, (data?: EventData) => {
      // 检查线程作者ID是否与当前配置的目标用户ID匹配
      if (data && data.authorId === this.twitterConfig.targetUserId) {
        this.logger.info(`Received TRANSLATION_COMPLETED event for thread by author ${data.authorId}, starting publishing`);
        this.publishPendingThreads();
      } else {
        this.logger.debug(`Ignoring TRANSLATION_COMPLETED event for thread by author ${data?.authorId || 'unknown'}, not matching ${this.twitterConfig.targetUserId}`);
      }
    });
  }

  /**
   * 发布待处理的线程
   */
  private async publishPendingThreads(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Previous publishing task is still running, skipping...');
      return;
    }

    this.isProcessing = true;
    try {
      // 获取Twitter客户端
      const client = this.twitterClient;
      if (!client) {
        this.logger.error(`Failed to get Twitter client for account ${this.twitterConfig.name}`);
        return;
      }

      // 获取一个待发布的线程，只处理与当前 Twitter 配置相关的线程
      const thread = await this.prisma.thread.findFirst({
        where: {
          status: Status.Translated,
          authorId: this.twitterConfig.targetUserId // 只处理与当前 Twitter 配置相关的线程
        },
        include: {
          tweets: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!thread) {
        this.logger.info(`No pending threads to publish for ${this.twitterConfig.name}`);
        return;
      }

      this.logger.info(`Found thread ${thread.id} with ${thread.tweets.length} tweets to publish for ${this.twitterConfig.name}`);
      // 开始发布线程
      let previousTweetId: string | undefined;
      for (const tweet of thread.tweets) {
        try {
          // 检查状态转换是否有效
          if (!isValidStatusTransition(tweet.status as Status, Status.Published)) {
            throw new InvalidStatusTransitionError(tweet.status as Status, Status.Published);
          }

          const response = await client.createTweet(
            tweet.translatedText || tweet.text,
            previousTweetId
          );

          if (!response.data?.id) {
            throw new Error('Failed to get tweet ID from response');
          }

          previousTweetId = response.data.id;

          // 更新推文状态
          await this.prisma.tweet.update({
            where: { id: tweet.id },
            data: { 
              status: Status.Published
            }
          });

          this.logger.info(`Successfully published tweet ${tweet.id}`);
        } catch (error) {
          this.logger.error(`Failed to publish tweet ${tweet.id}:`, error);
          
          // 检查状态转换是否有效
          if (!isValidStatusTransition(tweet.status as Status, Status.Failed)) {
            this.logger.warn(`Cannot transition tweet ${tweet.id} from ${tweet.status} to failed status`);
            continue;
          }

          // 更新失败状态
          await this.prisma.tweet.update({
            where: { id: tweet.id },
            data: {
              status: Status.Failed
            }
          });

          // 如果是限流错误，直接退出
          if ((error as any).status === 429) {
            break;
          }
          
          throw error;
        }
      }

      // 检查状态转换是否有效
      if (!isValidStatusTransition(thread.status as Status, Status.Published)) {
        throw new InvalidStatusTransitionError(thread.status as Status, Status.Published);
      }

      // 更新线程状态
      await this.prisma.thread.update({
        where: { id: thread.id },
        data: { 
          status: Status.Published,
          updatedAt: BigInt(Date.now())
        }
      });

      this.logger.info(`Successfully published thread ${thread.id}`);
    } catch (error) {
      this.logger.error('Error in publishPendingThreads:', error);
    } finally {
      this.isProcessing = false;
    }
  }
} 