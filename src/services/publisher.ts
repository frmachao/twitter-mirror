import { Database } from './database';
import { Logger } from '../utils/logger';
import { Status } from '../types/status';
import { Config } from '../types/config';
import { EventBus, ServiceEvent } from './event-bus';
import { TaskQueue } from './task-queue/queue';
import { PublishProcessor } from './task-queue/processors/publish-processor';

export class TweetPublisher {
  private static instances: Map<string, TweetPublisher> = new Map();
  private prisma: ReturnType<Database['getPrisma']>;
  private logger: Logger;
  private eventBus: EventBus;
  private taskQueue: TaskQueue;

  private constructor(private twitterConfig: Config['twitterConfig'][0]) {
    this.prisma = Database.getInstance().getPrisma();
    this.logger = new Logger(`TweetPublisher:${twitterConfig.name}`);
    this.eventBus = EventBus.getInstance();
    
    // 初始化任务队列
    this.taskQueue = new TaskQueue({
      name: `publish:${twitterConfig.name}`,
      concurrency: 1,
      maxRetries: 0,
      retryDelay: 5000
    });

    // 设置任务处理器
    this.taskQueue.setProcessor(new PublishProcessor(twitterConfig));

    // 订阅翻译完成事件
    this.eventBus.subscribe(ServiceEvent.TRANSLATION_COMPLETED, async (data?: any) => {
      if (!data?.threadId || !data?.authorId) {
        this.logger.warn('Received TRANSLATION_COMPLETED event without threadId or authorId');
        return;
      }

      // 只处理属于当前配置的用户的线程
      if (data.authorId !== this.twitterConfig.targetUserId) {
        return;
      }

      this.logger.info(`Received TRANSLATION_COMPLETED event for thread ${data.threadId}`);
      await this.queuePublication(data.threadId);
    });
  }

  public static getInstance(twitterConfig: Config['twitterConfig'][0]): TweetPublisher {
    if (!this.instances.has(twitterConfig.targetUserId)) {
      this.instances.set(twitterConfig.targetUserId, new TweetPublisher(twitterConfig));
    }
    return this.instances.get(twitterConfig.targetUserId)!;
  }

  /**
   * 将线程加入发布队列
   */
  private async queuePublication(threadId: string): Promise<void> {
    try {
      // 检查线程是否存在且状态为已翻译
      const thread = await this.prisma.thread.findFirst({
        where: {
          id: threadId,
          status: Status.Translated,
          authorId: this.twitterConfig.targetUserId // 确保只处理属于当前配置的线程
        }
      });

      if (!thread) {
        this.logger.warn(`Thread ${threadId} not found or not in Translated status or not owned by ${this.twitterConfig.name}`);
        return;
      }

      // 添加到任务队列
      await this.taskQueue.addTask('publish', { threadId });
      this.logger.info(`Added thread ${threadId} to publish queue for ${this.twitterConfig.name}`);

    } catch (error) {
      this.logger.error('Error queuing publication:', error);
    }
  }

  /**
   * 获取队列统计信息
   */
  public getQueueStats() {
    return this.taskQueue.getQueueStats();
  }

  /**
   * 获取指定任务的状态
   */
  public getTaskStatus(taskId: string) {
    return this.taskQueue.getTaskStatus(taskId);
  }

  /**
   * 获取多个任务的状态
   */
  public getTasksStatus(taskIds: string[]) {
    return this.taskQueue.getTasksStatus(taskIds);
  }
} 