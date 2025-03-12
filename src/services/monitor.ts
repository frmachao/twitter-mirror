import { CronJob } from 'cron';
import { PrismaClient } from '@prisma/client';
import { TwitterClient } from './twitter-client';
import { ThreadAnalyzer } from './thread-analyzer';
import { TwitterApiError, TwitterMedia } from '../types/twitter';
import { config } from '../config';
import { Logger } from '../utils/logger';

export class TweetMonitor {
  private job: CronJob;
  private prisma: PrismaClient;
  private twitterClient: TwitterClient;
  private threadAnalyzer: ThreadAnalyzer;
  private isProcessing: boolean = false;
  private logger: Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.twitterClient = TwitterClient.getInstance();
    this.threadAnalyzer = ThreadAnalyzer.getInstance();
    this.logger = new Logger('TweetMonitor');
    // 创建定时任务，每15分钟执行一次
    this.job = new CronJob('*/15 * * * *', () => this.monitor(), null, false);
  }

  private async monitor() {
    if (this.isProcessing) {
      this.logger.warn('Previous monitoring task is still running, skipping...');
      return;
    }

    this.isProcessing = true;
    try {
      // 获取处理状态
      let state = await this.prisma.processState.findFirst({
        where: { id: 'default' }
      });

      if (!state) {
        state = await this.prisma.processState.create({
          data: {
            id: 'default',
            startTime: BigInt(Date.now()),
            updatedAt: BigInt(Date.now())
          }
        });
      }

      const client = this.twitterClient.getMonitorClient();
      
      try {
        const response = await client.tweets.usersIdTweets(config.targetUserId, {
          max_results: config.maxTweetsPerRequest,
          since_id: state.lastTweetId || undefined,
          "tweet.fields": ["created_at", "conversation_id", "in_reply_to_user_id", "attachments", "author_id"],
          "media.fields": ["media_key", "type", "preview_image_url", "variants"],
          "expansions": ["attachments.media_keys"]
        });

        if (!response.data?.length) {
          console.log('No new tweets found');
          return;
        }

        // 获取媒体信息
        const mediaMap = new Map<string, TwitterMedia>();
        if (response.includes?.media) {
          for (const media of response.includes.media) {
            if (media.media_key) {
              mediaMap.set(media.media_key, media);
            }
          }
        }

        // 处理获取到的推文
        for (const tweet of response.data) {
          // 获取媒体 URLs
          const mediaUrls: string[] = [];
          if (tweet.attachments?.media_keys?.length) {
            for (const mediaKey of tweet.attachments.media_keys) {
              const media = mediaMap.get(mediaKey);
              if (media) {
                if (media.type === 'photo') {
                  // 对于图片，使用第一个变体的 URL
                  const url = media.variants?.[0]?.url;
                  if (url) mediaUrls.push(url);
                } else if (media.type === 'video' || media.type === 'animated_gif') {
                  // 对于视频和 GIF，使用最高比特率的变体
                  const variant = media.variants
                    ?.sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))
                    ?.[0];
                  const url = variant?.url || media.preview_image_url;
                  if (url) mediaUrls.push(url);
                }
              }
            }
          }

          // 创建推文记录
          await this.prisma.tweet.create({
            data: {
              id: tweet.id,
              authorId: config.targetUserId,
              conversationId: tweet.conversation_id || null,
              createdAt: BigInt(new Date(tweet.created_at!).getTime()),
              text: tweet.text,
              inReplyToUserId: tweet.in_reply_to_user_id || null,
              mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
              status: 'pending'
            }
          });

          // 分析推文线程
          await this.threadAnalyzer.analyzeTweet(tweet.id);
        }

        // 更新最后处理的推文ID
        await this.prisma.processState.update({
          where: { id: 'default' },
          data: {
            lastTweetId: response.data[0].id,
            updatedAt: BigInt(Date.now())
          }
        });

      } catch (error) {
        const twitterError = error as TwitterApiError;
        if (twitterError.status === 429) {
          const resetTime = twitterError.headers?.['x-rate-limit-reset'];
          if (resetTime) {
            const waitTime = (parseInt(resetTime) * 1000) - Date.now();
            this.logger.warn(`Rate limited. Waiting for ${waitTime / 1000} seconds...`);
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      this.logger.error('Error in monitor task:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isProcessing = false;
    }
  }

  public start() {
    this.job.start();
    this.logger.info('Tweet monitoring service started');
  }

  public stop() {
    this.job.stop();
    this.logger.info('Tweet monitoring service stopped');
  }
} 