import { TweetMonitor } from './services/monitor';
import { Translator } from './services/translator';
import { TweetPublisher } from './services/publisher';
import { Logger } from './utils/logger';

const logger = new Logger('App');

async function main() {
  try {
    // 创建服务实例
    const monitor = new TweetMonitor();
    const translator = new Translator();
    const publisher = new TweetPublisher();

    // 按照处理流程顺序启动服务
    monitor.start();    // 每15分钟执行一次
    translator.start(); // 每分钟执行一次
    publisher.start(); // 每分钟执行一次

    logger.info('All services started successfully');

    // 优雅关闭处理
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down services...');
      monitor.stop();
      translator.stop();
      publisher.stop();
      logger.info('All services stopped');
      process.exit(0);
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

main(); 