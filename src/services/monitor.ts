import { CronJob } from 'cron';
import { Database } from './database';
import { TwitterClient } from './twitter-client';
import { TwitterError, TwitterResponse, ExtendedMedia } from '../types/twitter';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { Config } from '../types/config';
import { DateUtils } from '../utils/date';
import { EventBus, ServiceEvent } from './event-bus';

export class TweetMonitor {
  private job!: CronJob;
  private prisma: ReturnType<Database['getPrisma']>;
  private twitterClient: TwitterClient;
  private isProcessing: boolean = false;
  private logger: Logger;
  private eventBus: EventBus;

  constructor(private twitterConfig: Config['twitterConfig'][0]) {
    this.prisma = Database.getInstance().getPrisma();
    this.twitterClient = TwitterClient.getInstance(twitterConfig);
    this.logger = new Logger('TweetMonitor');
    this.eventBus = EventBus.getInstance();
  }

  private async processMedia(mediaKeys: string[], mediaMap: Map<string, ExtendedMedia>): Promise<string[]> {
    const mediaUrls: string[] = [];
    for (const mediaKey of mediaKeys) {
      const media = mediaMap.get(mediaKey);
      if (media) {
        if (media.type === 'photo' && media.url) {
          mediaUrls.push(media.url);
        } else if ((media.type === 'video' || media.type === 'animated_gif') && media.variants) {
          const highestBitrateVariant = media.variants.reduce((prev, current) => {
            return (current.bit_rate || 0) > (prev.bit_rate || 0) ? current : prev;
          });
          if (highestBitrateVariant.url) {
            mediaUrls.push(highestBitrateVariant.url);
          }
        } else if (media.preview_image_url) {
          mediaUrls.push(media.preview_image_url);
        }
      }
    }
    return mediaUrls;
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
        const response: TwitterResponse = await client.tweets.usersIdTweets(this.twitterConfig.targetUserId, {
          max_results: config.maxTweetsPerRequest,
          since_id: state.lastTweetId || undefined,
          "tweet.fields": ["id", "text", "author_id", "created_at", "conversation_id", "in_reply_to_user_id"],
          "media.fields": ["url", "preview_image_url", "type", "variants"],
          "expansions": ["author_id", "attachments.media_keys"],
          start_time: DateUtils.getFifteenMinutesAgo()
        });

        if (!response.data?.length) {
          this.logger.info('No new tweets found');
          return;
        }

        // 获取媒体信息
        const mediaMap = new Map<string, ExtendedMedia>();
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
          const mediaUrls = await this.processMedia(tweet.attachments?.media_keys || [], mediaMap);

          // 创建推文记录
          await this.prisma.tweet.create({
            data: {
              id: tweet.id,
              authorId: this.twitterConfig.targetUserId,
              conversationId: tweet.conversation_id || null,
              createdAt: BigInt(new Date(tweet.created_at!).getTime()),
              text: tweet.text,
              inReplyToUserId: tweet.in_reply_to_user_id || null,
              mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
              status: 'pending'
            }
          });
        }

        // 更新最后处理的推文ID
        await this.prisma.processState.update({
          where: { id: 'default' },
          data: {
            lastTweetId: response.data[0].id,
            updatedAt: BigInt(Date.now())
          }
        });

        // 触发监控完成事件
        this.eventBus.emit(ServiceEvent.MONITOR_COMPLETED, {
          tweetCount: response.data.length
        });

      } catch (error) {
        const twitterError = error as TwitterError;
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
      this.eventBus.emit(ServiceEvent.MONITOR_COMPLETED, {
        error: error instanceof Error ? error : new Error('Unknown error')
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 启动监控服务
   */
  public start(): void {
    this.logger.info(`Starting monitor service for ${this.twitterConfig.name}`);
    
    // 先执行一次监控任务
    this.logger.info('Executing initial monitor task...');
    this.monitor().catch(error => {
      this.logger.error('Error in initial monitor task:', error);
    });

    this.job = new CronJob(config.cron.monitor, () => this.monitor(), null, false);
    this.job.start();
    
    this.logger.info(`Monitor service for ${this.twitterConfig.name} started with interval: ${config.cron.monitor}`);
  }

  public stop() {
    this.job.stop();
    this.logger.info('Tweet monitoring service stopped');
  }
} 