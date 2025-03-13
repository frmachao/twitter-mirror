import { Database } from './database';
import { TwitterClient } from './twitter-client';
import { Logger } from '../utils/logger';
import { CronJob } from 'cron';
import { Status, isValidStatusTransition, InvalidStatusTransitionError } from '../types/status';
import { Config } from '../types/config';

export class TweetPublisher {
  private prisma: ReturnType<Database['getPrisma']>;
  private twitterClient: TwitterClient;
  private logger: Logger;
  private job: CronJob;
  private isProcessing: boolean = false;

  constructor(private twitterConfig: Config['twitterConfig'][0]) {
    this.prisma = Database.getInstance().getPrisma();
    this.twitterClient = TwitterClient.getInstance(twitterConfig);
    this.logger = new Logger('TweetPublisher');
    // 创建定时任务，每分钟执行一次
    this.job = new CronJob('* * * * *', () => this.publishPendingThreads(), null, false);
  }

  /**
   * 启动发布服务
   */
  public start(): void {
    this.job.start();
    this.logger.info('Tweet publisher service started');
  }

  /**
   * 停止发布服务
   */
  public stop(): void {
    this.job.stop();
    this.logger.info('Tweet publisher service stopped');
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
      const client = this.twitterClient.getPublisherClient();
      if (!client) {
        this.logger.error(`Failed to get Twitter client for account ${this.twitterConfig.name}`);
        return;
      }

      // 获取一个待发布的线程
      const thread = await this.prisma.thread.findFirst({
        where: {
          status: Status.Translated
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
        return;
      }

      // 开始发布线程
      let previousTweetId: string | undefined;
      for (const tweet of thread.tweets) {
        try {
          // 检查状态转换是否有效
          if (!isValidStatusTransition(tweet.status as Status, Status.Published)) {
            throw new InvalidStatusTransitionError(tweet.status as Status, Status.Published);
          }

          const response = await client.tweets.createTweet({
            text: tweet.translatedText || tweet.text,
            reply: previousTweetId ? {
              in_reply_to_tweet_id: previousTweetId
            } : undefined
          });

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