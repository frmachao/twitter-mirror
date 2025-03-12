import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { Status, isValidStatusTransition, InvalidStatusTransitionError } from '../types/status';

export class ThreadAnalyzer {
  private static instance: ThreadAnalyzer;
  private prisma: PrismaClient;
  private logger: Logger;
  private constructor() {
    this.prisma = new PrismaClient();
    this.logger = new Logger('ThreadAnalyzer');
  }

  public static getInstance(): ThreadAnalyzer {
    if (!ThreadAnalyzer.instance) {
      ThreadAnalyzer.instance = new ThreadAnalyzer();
    }
    return ThreadAnalyzer.instance;
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