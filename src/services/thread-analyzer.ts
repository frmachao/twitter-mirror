import { Database } from './database';
import { Logger } from '../utils/logger';
import { Status, isValidStatusTransition, InvalidStatusTransitionError } from '../types/status';
import { EventBus, ServiceEvent } from './event-bus';

export class ThreadAnalyzer {
  private static instance: ThreadAnalyzer;
  private prisma: ReturnType<Database['getPrisma']>;
  private logger: Logger;
  private isProcessing: boolean = false;
  private eventBus: EventBus;

  private constructor() {
    this.prisma = Database.getInstance().getPrisma();
    this.logger = new Logger('ThreadAnalyzer');
    this.eventBus = EventBus.getInstance();
    
    // 订阅监控完成事件
    this.eventBus.subscribe(ServiceEvent.MONITOR_COMPLETED, () => {
      this.logger.info('Received MONITOR_COMPLETED event, starting tweet analysis');
      this.processPendingTweets();
    });
  }

  public static getInstance(): ThreadAnalyzer {
    if (!ThreadAnalyzer.instance) {
      ThreadAnalyzer.instance = new ThreadAnalyzer();
    }
    return ThreadAnalyzer.instance;
  }

  /**
   * 处理待分析的推文
   */
  private async processPendingTweets(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Previous analysis task is still running, skipping...');
      return;
    }

    this.isProcessing = true;
    try {
      // 获取待分析的推文
      const pendingTweets = await this.prisma.tweet.findMany({
        where: {
          status: 'pending'
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (!pendingTweets.length) {
        this.logger.info('No pending tweets to analyze');
        return;
      }

      this.logger.info(`Found ${pendingTweets.length} pending tweets to analyze`);
      for (const tweet of pendingTweets) {
        await this.analyzeTweet(tweet.id);
      }

      // 触发分析完成事件
      this.logger.info('Tweet analysis completed, emitting ANALYSIS_COMPLETED event');
      this.eventBus.emit(ServiceEvent.ANALYSIS_COMPLETED);
    } catch (error) {
      this.logger.error('Error in processPendingTweets:', error);
      this.eventBus.emit(ServiceEvent.ANALYSIS_COMPLETED, {
        error: error instanceof Error ? error : new Error('Unknown error')
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 分析新的推文，识别线程关系
   * @param tweetId 需要分析的推文ID
   */
  public async analyzeTweet(tweetId: string): Promise<void> {
    try {
      // 获取推文信息
      const tweet = await this.prisma.tweet.findUnique({
        where: { id: tweetId },
        select: {
          id: true,
          conversationId: true,
          inReplyToUserId: true,
          authorId: true,
          createdAt: true
        }
      });

      if (!tweet) {
        this.logger.warn(`Tweet ${tweetId} not found`);
        return;
      }

      // 如果没有会话ID，说明这是一个独立的推文
      if (!tweet.conversationId) {
        await this.handleSingleTweet(tweet);
        return;
      }

      // 处理线程中的推文
      await this.handleThreadTweet(tweet);
    } catch (error) {
      this.logger.error('Error analyzing tweet:', error);
      throw error;
    }
  }

  /**
   * 处理独立推文
   */
  private async handleSingleTweet(tweet: {
    id: string;
    conversationId: string | null;
    inReplyToUserId: string | null;
    authorId: string;
    createdAt: bigint;
  }): Promise<void> {
    // 为独立推文创建线程记录
    // 使用推文ID作为线程ID，保持一致性
    const thread = await this.prisma.thread.create({
      data: {
        id: tweet.id,
        rootTweetId: tweet.id,
        authorId: tweet.authorId,
        createdAt: tweet.createdAt,
        status: 'pending',
        tweets: {
          connect: { id: tweet.id }
        }
      }
    });

    // 更新推文状态
    await this.prisma.tweet.update({
      where: { id: tweet.id },
      data: {
        threadId: thread.id,
        isRoot: true,  // 独立推文自身就是根
        status: 'analyzed'
      }
    });
  }

  /**
   * 处理线程中的推文
   */
  private async handleThreadTweet(tweet: {
    id: string;
    conversationId: string | null;
    inReplyToUserId: string | null;
    authorId: string;
    createdAt: bigint;
  }): Promise<void> {
    if (!tweet.conversationId) return;

    // 查找或创建线程
    const thread = await this.prisma.thread.upsert({
      where: { id: tweet.conversationId },
      create: {
        id: tweet.conversationId,
        rootTweetId: tweet.conversationId,
        authorId: tweet.authorId,
        createdAt: tweet.createdAt,
        status: Status.Pending,
        tweets: {
          connect: { id: tweet.id }
        }
      },
      update: {
        tweets: {
          connect: { id: tweet.id }
        }
      }
    });

    // 检查状态转换是否有效
    if (!isValidStatusTransition(Status.Pending, Status.Analyzed)) {
      throw new InvalidStatusTransitionError(Status.Pending, Status.Analyzed);
    }

    // 更新推文状态
    await this.prisma.tweet.update({
      where: { id: tweet.id },
      data: {
        threadId: thread.id,
        isRoot: tweet.id === tweet.conversationId,
        status: Status.Analyzed
      }
    });

    // 如果这是根推文，更新线程信息
    if (tweet.id === tweet.conversationId) {
      await this.prisma.thread.update({
        where: { id: thread.id },
        data: {
          rootTweetId: tweet.id,
          status: Status.Analyzed
        }
      });
    }
  }
} 