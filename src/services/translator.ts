import { Database } from './database';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { Status, isValidStatusTransition, InvalidStatusTransitionError } from '../types/status';
import { EventBus, ServiceEvent } from './event-bus';
import { TranslationFactory } from './translation-providers';

export class Translator {
  private static instance: Translator;
  private prisma: ReturnType<Database['getPrisma']>;
  private logger: Logger;
  private isProcessing: boolean = false;
  private eventBus: EventBus;
  private translationFactory: TranslationFactory;

  private constructor() {
    this.prisma = Database.getInstance().getPrisma();
    this.logger = new Logger('Translator');
    this.eventBus = EventBus.getInstance();
    this.translationFactory = TranslationFactory.getInstance();
    
    // 订阅分析完成事件
    this.eventBus.subscribe(ServiceEvent.ANALYSIS_COMPLETED, () => {
      this.logger.info('Received ANALYSIS_COMPLETED event, starting translation');
      this.translatePendingThreads();
    });
  }
  
  public static getInstance(): Translator {
    if (!Translator.instance) {
      Translator.instance = new Translator();
    }
    return Translator.instance;
  }

  /**
   * 处理待翻译的线程
   */
  public async translatePendingThreads(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Previous translation task is still running, skipping...');
      return;
    }

    this.isProcessing = true;
    try {
      // 获取待翻译的线程
      const thread = await this.prisma.thread.findFirst({
        where: {
          status: Status.Analyzed
        },
        include: {
          tweets: true
        }
      });

      if (!thread) {
        this.logger.info('No pending threads to translate');
        return;
      }

      this.logger.info(`Found thread ${thread.id} with ${thread.tweets.length} tweets to translate`);
      // 开始翻译线程中的每条推文
      for (const tweet of thread.tweets) {
        try {
          // 检查状态转换是否有效
          if (!isValidStatusTransition(tweet.status as Status, Status.Translated)) {
            throw new InvalidStatusTransitionError(tweet.status as Status, Status.Translated);
          }

          // 调用翻译服务
          const translatedText = await this.translateText(tweet.text);

          // 更新推文的翻译内容
          await this.prisma.tweet.update({
            where: { id: tweet.id },
            data: {
              translatedText,
              status: Status.Translated
            }
          });

          this.logger.info(`Successfully translated tweet ${tweet.id}`);
        } catch (error) {
          this.logger.error(`Failed to translate tweet ${tweet.id}:`, error);
          
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

          // 如果是翻译服务的错误，我们应该停止处理当前线程
          throw error;
        }
      }

      // 检查状态转换是否有效
      if (!isValidStatusTransition(thread.status as Status, Status.Translated)) {
        throw new InvalidStatusTransitionError(thread.status as Status, Status.Translated);
      }

      // 更新线程状态
      await this.prisma.thread.update({
        where: { id: thread.id },
        data: {
          status: Status.Translated,
          updatedAt: BigInt(Date.now())
        }
      });

      this.logger.info(`Successfully translated thread ${thread.id}`);
      
      // 触发翻译完成事件
      this.logger.info('Translation completed, emitting TRANSLATION_COMPLETED event');
      this.eventBus.emit(ServiceEvent.TRANSLATION_COMPLETED, {
        threadId: thread.id,
        authorId: thread.authorId
      });
    } catch (error) {
      this.logger.error('Error in translatePendingThreads:', error);
      this.eventBus.emit(ServiceEvent.TRANSLATION_COMPLETED, {
        error: error instanceof Error ? error : new Error('Unknown error')
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 调用翻译服务翻译文本
   */
  private async translateText(text: string): Promise<string> {
    try {
      const translationProvider = this.translationFactory.getProvider();
      return await translationProvider.translate(
        text,
        config.translationSourceLang || 'en',
        config.translationTargetLang || 'zh'
      );
    } catch (error) {
      this.logger.error('Error in translation service:', error);
      throw new Error(`Translation service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 