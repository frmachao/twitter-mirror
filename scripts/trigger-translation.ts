import { Database } from '../src/services/database';
import { Status } from '../src/types/status';
import { Logger } from '../src/utils/logger';
import { Translator } from '../src/services/translator';
import { TweetPublisher } from '../src/services/publisher';
import { config } from '../src/config';
import { TaskStatus } from '../src/types/task-queue';

const logger = new Logger('TriggerTranslation');

async function waitForQueueCompletion(
  translator: Translator, 
  publishers: TweetPublisher[], 
  translationTaskIds: string[]
): Promise<void> {
  while (true) {
    // 获取翻译任务的状态
    const translationTasks = translator.getTasksStatus(translationTaskIds);
    const allTranslationTasksCompleted = Object.values(translationTasks).every(
      task => !task || task.status === TaskStatus.COMPLETED
    );

    // 获取发布任务的状态
    const publisherStats = publishers.map(p => p.getQueueStats());
    const allPublishersEmpty = publisherStats.every(stats => 
      stats.pending === 0 && stats.processing === 0
    );

    if (allTranslationTasksCompleted && allPublishersEmpty) {
      logger.info('All tasks have completed processing');
      break;
    }

    logger.info('Tasks status:', {
      translation: {
        tasks: translationTasks,
        completed: allTranslationTasksCompleted
      },
      publishers: publisherStats
    });

    // 等待1秒后再次检查
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function triggerTranslation() {
  const prisma = Database.getInstance().getPrisma();
  const translator = Translator.getInstance();
  
  // 初始化所有配置的发布服务
  const publishers = config.twitterConfig.map(cfg => TweetPublisher.getInstance(cfg));

  try {
    // 获取所有已分析的线程
    const analyzedThreads = await prisma.thread.findMany({
      where: {
        status: Status.Analyzed
      }
    });

    if (analyzedThreads.length === 0) {
      logger.info('No analyzed threads found');
      return;
    }

    logger.info(`Found ${analyzedThreads.length} analyzed threads`);

    // 存储所有任务的ID
    const translationTaskIds: string[] = [];

    // 处理每个已分析的线程
    for (const thread of analyzedThreads) {
      try {
        logger.info(`Adding thread ${thread.id} to translation queue`);
        const task = await translator['queueTranslation'](thread.id);
        if (task) {
          translationTaskIds.push(task.id);
          logger.info(`Added thread ${thread.id} to translation queue with task ID ${task.id}`);
        } else {
          logger.error(`Failed to add thread ${thread.id} to translation queue`);
        }
      } catch (error) {
        logger.error(`Error processing thread ${thread.id}:`, error);
      }
    }

    // 等待所有队列处理完成
    logger.info('Waiting for all queues to complete...');
    await waitForQueueCompletion(translator, publishers, translationTaskIds);
    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info("wait 3 seconds");
    await waitForQueueCompletion(translator, publishers, translationTaskIds);
    logger.info('All processing completed');

  } catch (error) {
    logger.error('Error while triggering translation:', error);
  } finally {
    // 关闭数据库连接
    logger.info('Closing database connection');
    // await Database.getInstance().disconnect();
  }
}

// 运行脚本
triggerTranslation().catch(error => {
  logger.error('Script failed:', error);
  process.exit(1);
}); 