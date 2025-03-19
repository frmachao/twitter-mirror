import { Database } from './database';
import { Logger } from '../utils/logger';
import { Status } from '../types/status';
import { EventBus, ServiceEvent } from './event-bus';
import { TaskQueue } from './task-queue/queue';
import { TranslationProcessor } from './task-queue/processors/translation-processor';
import { Task } from '../types/task-queue';

export class Translator {
  private static instance: Translator;
  private prisma: ReturnType<Database['getPrisma']>;
  private logger: Logger;
  private eventBus: EventBus;
  private taskQueue: TaskQueue;

  private constructor() {
    this.prisma = Database.getInstance().getPrisma();
    this.logger = new Logger('Translator');
    this.eventBus = EventBus.getInstance();
    
    // 初始化任务队列
    this.taskQueue = new TaskQueue({
      name: 'translation',
      concurrency: 1,
      maxRetries: 3,
      retryDelay: 5000
    });
    
    // 设置任务处理器
    this.taskQueue.setProcessor(new TranslationProcessor());
    
    // 订阅分析完成事件
    this.eventBus.subscribe(ServiceEvent.ANALYSIS_COMPLETED, async (data?: any) => {
      if (!data?.threadId) {
        this.logger.warn('Received ANALYSIS_COMPLETED event without threadId');
        return;
      }

      this.logger.info(`Received ANALYSIS_COMPLETED event for thread ${data.threadId}`);
      await this.queueTranslation(data.threadId);
    });
  }
  
  public static getInstance(): Translator {
    if (!Translator.instance) {
      Translator.instance = new Translator();
    }
    return Translator.instance;
  }

  /**
   * 将线程加入翻译队列
   */
  private async queueTranslation(threadId: string): Promise<Task | null> {
    try {
      // 检查线程是否存在且状态为已分析
      const thread = await this.prisma.thread.findFirst({
        where: {
          id: threadId,
          status: Status.Analyzed
        }
      });

      if (!thread) {
        this.logger.warn(`Thread ${threadId} not found or not in Analyzed status`);
        return null;
      }

      // 添加到任务队列
      const task = await this.taskQueue.addTask('translation', { threadId });
      this.logger.info(`Added thread ${threadId} to translation queue`);
      return task;
    } catch (error) {
      this.logger.error('Error queuing translation:', error);
      return null;
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