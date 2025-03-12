import { PrismaClient } from '@prisma/client';
import { TwitterClient } from './twitter-client';
import { Logger } from '../utils/logger';
import { CronJob } from 'cron';
import { Status, isValidStatusTransition, InvalidStatusTransitionError } from '../types/status';

export class TweetPublisher {
  private prisma: PrismaClient;
  private twitterClient: TwitterClient;
  private logger: Logger;
  private job: CronJob;
  private isProcessing: boolean = false;

  constructor() {
    this.prisma = new PrismaClient();
    this.twitterClient = TwitterClient.getInstance();
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
      // 获取一个可用的发布账号
      const account = await this.getAvailableAccount();
      if (!account) {
        this.logger.warn('No available publishing accounts');
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

      // 获取Twitter客户端
      const client = this.twitterClient.getPublisherClient(account.token);
      if (!client) {
        this.logger.error(`Failed to get Twitter client for account ${account.id}`);
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

      // 更新账号使用统计
      await this.updateAccountUsage(account.id);

      this.logger.info(`Successfully published thread ${thread.id}`);
    } catch (error) {
      this.logger.error('Error in publishPendingThreads:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 获取一个可用的发布账号
   */
  private async getAvailableAccount() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    return await this.prisma.publisherAccount.findFirst({
      where: {
        OR: [
          { dailyUsageCount: { lt: 17 } },
          { lastResetAt: { lt: BigInt(oneDayAgo) } }
        ]
      },
      orderBy: {
        dailyUsageCount: 'asc'
      }
    });
  }

  /**
   * 更新账号使用统计
   */
  private async updateAccountUsage(accountId: string): Promise<void> {
    const now = BigInt(Date.now());
    const oneDayAgo = BigInt(Date.now() - 24 * 60 * 60 * 1000);

    const account = await this.prisma.publisherAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) return;

    // 如果超过24小时，重置计数
    if (account.lastResetAt < oneDayAgo) {
      await this.prisma.publisherAccount.update({
        where: { id: accountId },
        data: {
          dailyUsageCount: 1,
          lastResetAt: now,
          updatedAt: now
        }
      });
    } else {
      // 增加使用计数
      await this.prisma.publisherAccount.update({
        where: { id: accountId },
        data: {
          dailyUsageCount: account.dailyUsageCount + 1,
          updatedAt: now
        }
      });
    }
  }
} 