import { Database } from "./database";
import { Logger } from "../utils/logger";
import {
  Status,
  isValidStatusTransition,
  InvalidStatusTransitionError,
} from "../types/status";
import { EventBus, ServiceEvent } from "./event-bus";

export class ThreadAnalyzer {
  private static instance: ThreadAnalyzer;
  private prisma: ReturnType<Database["getPrisma"]>;
  private logger: Logger;
  private isProcessing: boolean = false;
  private eventBus: EventBus;

  private constructor() {
    this.prisma = Database.getInstance().getPrisma();
    this.logger = new Logger("ThreadAnalyzer");
    this.eventBus = EventBus.getInstance();

    // 订阅监控完成事件
    this.eventBus.subscribe(ServiceEvent.MONITOR_COMPLETED, () => {
      this.logger.info(
        "Received MONITOR_COMPLETED event, starting tweet analysis"
      );
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
      this.logger.warn("Previous analysis task is still running, skipping...");
      return;
    }

    this.isProcessing = true;
    try {
      // 获取待分析的推文
      const pendingTweets = await this.prisma.tweet.findMany({
        where: {
          status: "pending",
        },
        select: {
          id: true,
          conversationId: true,
          inReplyToUserId: true,
          authorId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (!pendingTweets.length) {
        this.logger.info("No pending tweets to analyze");
        return;
      }

      this.logger.info(
        `Found ${pendingTweets.length} pending tweets to analyze`
      );

      // 记录已分析完成的线程ID
      const analyzedThreadIds = new Set<string>();

      // 处理所有待分析推文
      for (const tweet of pendingTweets) {
        await this.analyzeTweet(tweet);

        // 获取更新后的推文信息
        const updatedTweet = await this.prisma.tweet.findUnique({
          where: { id: tweet.id },
          select: { threadId: true },
        });

        if (updatedTweet?.threadId) {
          analyzedThreadIds.add(updatedTweet.threadId);
        }
      }

      // 批量更新线程状态
      if (analyzedThreadIds.size > 0) {
        await this.prisma.thread.updateMany({
          where: {
            id: {
              in: Array.from(analyzedThreadIds),
            },
          },
          data: {
            status: Status.Analyzed,
            updatedAt: BigInt(Date.now()),
          },
        });
        this.logger.info(
          `Updated status for ${analyzedThreadIds.size} threads`
        );
      }

      // 触发已分析线程的事件
      for (const threadId of analyzedThreadIds) {
        this.logger.info(
          `Thread ${threadId} analysis completed, emitting ANALYSIS_COMPLETED event`
        );
        this.eventBus.emit(ServiceEvent.ANALYSIS_COMPLETED, {
          threadId,
        });
      }
    } catch (error) {
      this.logger.error("Error in processPendingTweets:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 分析新的推文，识别线程关系
   * @param tweet 需要分析的推文数据
   */
  public async analyzeTweet(tweet: {
    id: string;
    conversationId: string | null;
    inReplyToUserId: string | null;
    authorId: string;
    createdAt: bigint;
  }): Promise<void> {
    try {
      // 如果没有会话ID，说明这是一个独立的推文
      if (!tweet.conversationId) {
        await this.handleSingleTweet(tweet);
        return;
      }

      // 处理线程中的推文
      await this.handleThreadTweet(tweet);
    } catch (error) {
      this.logger.error("Error analyzing tweet:", error);
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
    const thread = await this.prisma.thread.create({
      data: {
        id: tweet.id,
        authorId: tweet.authorId,
        createdAt: tweet.createdAt,
        status: Status.Analyzed,
        tweets: {
          connect: { id: tweet.id },
        },
      },
    });

    // 更新推文状态
    await this.prisma.tweet.update({
      where: { id: tweet.id },
      data: {
        threadId: thread.id,
        isRoot: true,
        status: Status.Analyzed,
      },
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
        authorId: tweet.authorId,
        createdAt: tweet.createdAt,
        status: Status.Pending,
        tweets: {
          connect: { id: tweet.id },
        },
      },
      update: {
        tweets: {
          connect: { id: tweet.id },
        },
      },
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
        status: Status.Analyzed,
      },
    });
  }
}
