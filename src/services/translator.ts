import { Database } from './database';
import { Logger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config';
import { CronJob } from 'cron';
import { Status, isValidStatusTransition, InvalidStatusTransitionError } from '../types/status';

export class Translator {
  private static instance: Translator;
  private prisma: ReturnType<Database['getPrisma']>;
  private logger: Logger;
  private job: CronJob;
  private isProcessing: boolean = false;

  private constructor() {
    this.prisma = Database.getInstance().getPrisma();
    this.logger = new Logger('Translator');
    // 使用配置中的 Cron 间隔
    this.job = new CronJob(config.cron.translator, () => this.translatePendingThreads(), null, false);
  }
  
  public static getInstance(): Translator {
    if (!Translator.instance) {
      Translator.instance = new Translator();
    }
    return Translator.instance;
  }

  /**
   * 启动翻译服务
   */
  public start(): void {
    this.job.start();
    this.logger.info('Translation service started');
  }

  /**
   * 停止翻译服务
   */
  public stop(): void {
    this.job.stop();
    this.logger.info('Translation service stopped');
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
          status: Status.Analyzed  // 使用枚举值
        },
        include: {
          tweets: true
        }
      });

      if (!thread) {
        return;
      }

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
    } catch (error) {
      this.logger.error('Error in translatePendingThreads:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 调用翻译服务翻译文本
   */
  private async translateText(text: string): Promise<string> {
    try {
      const response = await axios.post(
        config.translationApiUrl, 
        {
          text,
          source_lang: config.translationSourceLang,
          target_lang: config.translationTargetLang
        },
        {
          timeout: config.translationTimeout
        }
      );

      if (!response.data?.translated_text) {
        throw new Error('Translation service did not return translated text');
      }

      return response.data.translated_text;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Translation service timeout');
        }
        throw new Error(`Translation service error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
} 