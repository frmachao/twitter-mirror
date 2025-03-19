import { Logger } from '../utils/logger';

export enum ServiceEvent {
  MONITOR_COMPLETED = 'MONITOR_COMPLETED',
  MONITOR_ERROR = 'MONITOR_ERROR',
  ANALYSIS_COMPLETED = 'ANALYSIS_COMPLETED',
  TRANSLATION_COMPLETED = 'TRANSLATION_COMPLETED'
}

export interface EventData {
  tweetCount?: number;
  threadId?: string;
  authorId?: string;
  targetUserId?: string;
  error?: Error;
}

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<ServiceEvent, Function[]> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('EventBus');
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public subscribe(event: ServiceEvent, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    this.logger.info(`Subscribed to event: ${event}`);
  }

  public emit(event: ServiceEvent, data?: EventData): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.logger.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
    this.logger.info(`Emitted event: ${event}`, data);
  }

  public unsubscribe(event: ServiceEvent, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
    this.logger.info(`Unsubscribed from event: ${event}`);
  }
} 