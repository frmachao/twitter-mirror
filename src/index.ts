import { TweetMonitor } from './services/monitor';
import { TweetPublisher } from './services/publisher';
import { ThreadAnalyzer } from './services/thread-analyzer';
import { Translator } from './services/translator';
import { Logger } from './utils/logger';
import { config } from './config';
import { Database } from './services/database';

const logger = new Logger('App');

async function main() {
  try {
    // 1. 初始化数据库连接
    const database = Database.getInstance();
    await database.connect();

    // 2. 初始化单例服务
    ThreadAnalyzer.getInstance();
    Translator.getInstance();
    logger.info('Singleton services initialized');

    // 3. 创建服务实例
    const monitors: TweetMonitor[] = [];
    const publishers: TweetPublisher[] = [];

    // 4. 为每个配置创建服务实例
    for (const twitterConfig of config.twitterConfig) {
      const monitor = new TweetMonitor(twitterConfig);
      const publisher = new TweetPublisher(twitterConfig);

      monitors.push(monitor);
      publishers.push(publisher);

      // 启动监控服务
      monitor.start();

      logger.info(`Services for ${twitterConfig.name} initialized successfully`);
    }

    logger.info('All services started successfully');

    // 5. 优雅关闭
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down gracefully...');
      
      // 停止监控服务
      for (const monitor of monitors) {
        monitor.stop();
      }
      
      // 断开数据库连接
      await Database.getInstance().disconnect();
      
      process.exit(0);
    });

    // 处理未捕获的异常
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught Exception:', error);
      await database.disconnect();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await database.disconnect();
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

main(); 