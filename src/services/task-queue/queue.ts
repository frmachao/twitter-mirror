import { Task, TaskStatus, TaskProcessor } from '../../types/task-queue';
import { Logger } from '../../utils/logger';
import { EventBus } from '../event-bus';
import { v4 as uuidv4 } from 'uuid';

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

interface QueueOptions {
  name: string;
  concurrency: number;
  maxRetries: number;
  retryDelay: number;
}

export class TaskQueue {
  private queue: Task[] = [];
  private processing: Set<Task> = new Set();
  private logger: Logger;
  private processor?: TaskProcessor;
  private isProcessing: boolean = false;
  private stats: QueueStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };
  private eventBus: EventBus;

  constructor(private options: QueueOptions) {
    this.logger = new Logger(`TaskQueue:${options.name}`);
    this.eventBus = EventBus.getInstance();
  }

  public setProcessor(processor: TaskProcessor) {
    this.processor = processor;
  }

  public async addTask(type: string, data: any, priority: number = 0): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      type,
      data,
      priority,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: TaskStatus.PENDING,
      retries: 0,
      maxRetries: this.options.maxRetries
    };

    this.queue.push(task);
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.stats.pending++;
    
    this.logger.info(`Added task ${task.id} of type ${type} to queue`);
    
    if (!this.isProcessing) {
      this.processQueue();
    }
    
    return task;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.processor) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.processing.size < this.options.concurrency) {
        const task = this.queue.shift()!;
        this.processing.add(task);
        this.stats.pending--;
        this.stats.processing++;

        this.logger.info(`Starting task ${task.id}. Queue status: processing=${this.processing.size}/${this.options.concurrency}, pending=${this.queue.length}`);

        try {
          await this.processTask(task);
        } catch (error) {
          this.logger.error(`Failed to process task ${task.id}:`, error);
        }
      }
    } finally {
      if (this.queue.length === 0 && this.processing.size === 0) {
        this.isProcessing = false;
        this.logger.info('Queue processing completed');
      } else if (this.queue.length > 0) {
        // 如果队列中还有任务，继续处理
        this.isProcessing = false;
        this.processQueue();
      }
    }
  }

  private async processTask(task: Task): Promise<void> {
    try {
      this.logger.info(`Processing task ${task.id} (attempt ${task.retries + 1})`);
      await this.processor!.process(task);
      
      this.processing.delete(task);
      this.stats.processing--;
      this.stats.completed++;
      this.logger.info(`Successfully completed task ${task.id}`);
    } catch (error) {
      task.retries++;
      task.status = TaskStatus.PENDING;
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.updatedAt = new Date();

      if (task.retries < this.options.maxRetries) {
        // 计算重试延迟
        const delay = this.options.retryDelay * Math.pow(2, task.retries - 1);
        this.logger.warn(`Task ${task.id} failed, will retry in ${delay}ms. Error: ${task.error}`);
        
        // 延迟后重试
        setTimeout(() => {
          this.queue.unshift(task);
          this.stats.pending++;
          this.stats.processing--;
          this.processing.delete(task);
          
          if (!this.isProcessing) {
            this.processQueue();
          }
        }, delay);
      } else {
        this.logger.error(`Task ${task.id} failed permanently after ${task.retries} attempts. Last error: ${task.error}`);
        this.processing.delete(task);
        this.stats.processing--;
        this.stats.failed++;
      }
    }
  }

  public getQueueStats(): QueueStats {
    return { ...this.stats };
  }

  public getTaskStatus(taskId: string): Task | undefined {
    // 检查队列中的任务
    const pendingTask = this.queue.find(task => task.id === taskId);
    if (pendingTask) {
      return pendingTask;
    }

    // 检查正在处理的任务
    for (const task of this.processing) {
      if (task.id === taskId) {
        return task;
      }
    }

    return undefined;
  }

  public getTasksStatus(taskIds: string[]): { [taskId: string]: Task | undefined } {
    return taskIds.reduce((acc, taskId) => {
      acc[taskId] = this.getTaskStatus(taskId);
      return acc;
    }, {} as { [taskId: string]: Task | undefined });
  }
} 