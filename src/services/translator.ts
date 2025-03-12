import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config';

export class Translator {
  private prisma: PrismaClient;
  private logger: Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.logger = new Logger('Translator');
  }

  /**
   * 处理待翻译的线程
   */
  public async translatePendingThreads(): Promise<void> {
    try {
      // 获取待翻译的线程
      const thread = await this.prisma.thread.findFirst({
        where: {
          status: 'analyzed'  // 线程分析完成后的状态
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
          // 调用翻译服务
          const translatedText = await this.translateText(tweet.text);

          // 更新推文的翻译内容
          await this.prisma.tweet.update({
            where: { id: tweet.id },
            data: {
              translatedText,
              status: 'translated'
            }
          });

          this.logger.info(`Successfully translated tweet ${tweet.id}`);
        } catch (error) {
          this.logger.error(`Failed to translate tweet ${tweet.id}:`, error);
          
          // 更新失败状态
          await this.prisma.tweet.update({
            where: { id: tweet.id },
            data: {
              status: 'translation_failed'
            }
          });

          // 如果是翻译服务的错误，我们应该停止处理当前线程
          throw error;
        }
      }

      // 更新线程状态
      await this.prisma.thread.update({
        where: { id: thread.id },
        data: {
          status: 'translated',
          updatedAt: BigInt(Date.now())
        }
      });

      this.logger.info(`Successfully translated thread ${thread.id}`);
    } catch (error) {
      this.logger.error('Error in translatePendingThreads:', error);
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