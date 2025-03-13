import { TweetMonitor } from './services/monitor';
import { Translator } from './services/translator';
import { TweetPublisher } from './services/publisher';
import { Logger } from './utils/logger';
import { config } from './config';
import { Database } from './services/database';
import { ThreadAnalyzer } from './services/thread-analyzer';

const logger = new Logger('App');

async function main() {
  try {
    // 1. 初始化数据库连接
    const database = Database.getInstance();
    await database.connect();

    // 2. 创建核心服务实例
    const threadAnalyzer = ThreadAnalyzer.getInstance();
    const translator = Translator.getInstance();
    const monitors: TweetMonitor[] = [];
    const publishers: TweetPublisher[] = [];

    // 3. 为每个配置创建服务实例
    for (const twitterConfig of config.twitterConfig) {
      const monitor = new TweetMonitor(twitterConfig);
      const publisher = new TweetPublisher(twitterConfig);

      monitors.push(monitor);
      publishers.push(publisher);

      // 按照处理流程顺序启动服务
      monitor.start();  
      publisher.start(); 

      logger.info(`All services for ${twitterConfig.name} started successfully`);
    }

    // 4. 启动核心服务
    threadAnalyzer.start();
    translator.start();

    // 优雅关闭处理
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down services...');
      
      // 按照依赖关系的反序关闭服务
      translator.stop();
      threadAnalyzer.stop();
      
      for (const publisher of publishers) {
        await publisher.stop();
      }
      
      for (const monitor of monitors) {
        await monitor.stop();
      }
      
      await database.disconnect();
      
      logger.info('All services stopped');
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