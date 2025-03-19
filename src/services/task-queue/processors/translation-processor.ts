import { Task, TaskProcessor } from '../../../types/task-queue';
import { Database } from '../../database';
import { Logger } from '../../../utils/logger';
import { Status, isValidStatusTransition } from '../../../types/status';
import { EventBus, ServiceEvent } from '../../event-bus';
import { TranslationFactory } from '../../translation-providers';

export class TranslationProcessor implements TaskProcessor {
  private prisma = Database.getInstance().getPrisma();
  private logger = new Logger('TranslationProcessor');
  private eventBus = EventBus.getInstance();
  private translationFactory = TranslationFactory.getInstance();

  async process(task: Task): Promise<void> {
    const { threadId } = task.data;

    // 获取需要翻译的线程
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      include: { tweets: true }
    });

    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    // 开始翻译线程中的每条推文
    for (const tweet of thread.tweets) {
      // 检查状态转换是否有效
      if (!isValidStatusTransition(tweet.status as Status, Status.Translated)) {
        this.logger.warn(`Invalid status transition for tweet ${tweet.id} from ${tweet.status} to ${Status.Translated}`);
        continue;
      }

      try {
        // 调用翻译服务
        const translatedText = await this.translationFactory.getProvider().translate(
          tweet.text,
          'en',
          'zh'
        );

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
        throw error;
      }
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
    this.eventBus.emit(ServiceEvent.TRANSLATION_COMPLETED, {
      threadId: thread.id,
      authorId: thread.authorId
    });
  }
} 