import { PrismaClient } from '@prisma/client';
import { TweetMonitor } from './services/monitor';
import { TweetPublisher } from './services/publisher';
import { CronJob } from 'cron';

async function main() {
  // 初始化数据库
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('Database connected');

    // 启动监控服务
    const monitor = new TweetMonitor();
    monitor.start();

    // 创建发布服务
    const publisher = new TweetPublisher();
    
    // 每分钟检查一次待发布的推文
    const publishJob = new CronJob('* * * * *', () => publisher.publishPendingThreads());
    publishJob.start();

    // 优雅退出
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      monitor.stop();
      publishJob.stop();
      await prisma.$disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start application:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main(); 