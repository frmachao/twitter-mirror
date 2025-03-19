import { Database } from '../src/services/database';
import { Status } from '../src/types/status';
import { config } from '../src/config';
import { TweetPublisher } from '../src/services/publisher';
import { Logger } from '../src/utils/logger';

const logger = new Logger('RetryFailedTweets');


async function retryFailedTweets() {
  const prisma = Database.getInstance().getPrisma();

  try {
    // 获取所有失败的线程
    const failedThreads = await prisma.thread.findMany({
      where: {
        tweets: {
          some: {
            status: Status.Failed
          }
        }
      }
    });

    if (failedThreads.length === 0) {
      logger.info('No failed threads found');
      return;
    }

    logger.info(`Found ${failedThreads.length} threads with failed tweets`);

    // 为每个 Twitter 配置创建发布器实例
    const publishers = config.twitterConfig.map(twitterConfig => TweetPublisher.getInstance(twitterConfig));

    // 处理每个失败的线程
    for (const thread of failedThreads) {
      try {
        logger.info(`Processing thread ${thread.id}`);

        // 找到对应的发布器
        const publisher = publishers.find(p => p['twitterConfig'].targetUserId === thread.authorId);
        if (!publisher) {
          logger.error(`No publisher found for author ${thread.authorId}`);
          continue;
        }

        // 重置线程中所有失败推文的状态为 Translated
        await prisma.tweet.updateMany({
          where: {
            threadId: thread.id,
            status: Status.Failed
          },
          data: {
            status: Status.Translated
          }
        });

        // 更新线程状态为 Translated
        await prisma.thread.update({
          where: { id: thread.id },
          data: {
            status: Status.Translated,
            updatedAt: BigInt(Date.now())
          }
        });

        // 将线程添加到发布队列
        await publisher['queuePublication'](thread.id);
        logger.info(`Added thread ${thread.id} to publish queue`);

        // 输出队列统计信息
        const stats = publisher.getQueueStats();
        logger.info(`Publish queue stats for ${publisher['twitterConfig'].name}:`, stats);

      } catch (error) {
        logger.error(`Error processing thread ${thread.id}:`, error);
      }
    }

  } catch (error) {
    logger.error('Error while retrying failed tweets:', error);
  } finally {
    // 关闭数据库连接
    logger.info('Database connection closed');
    // await Database.getInstance().disconnect();
  }
}

// 运行脚本
retryFailedTweets().catch(error => {
  logger.error('Script failed:', error);
  process.exit(1);
}); 