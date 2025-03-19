export interface Task {
  id: string;
  type: string;
  data: any;
  priority?: number;
  createdAt: Date;
  updatedAt: Date;
  status: TaskStatus;
  retries: number;
  maxRetries?: number;
  error?: string;
}

export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface TaskProcessor {
  process(task: Task): Promise<void>;
}

export interface TaskQueueOptions {
  name: string;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
} 
