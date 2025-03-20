import { Task, TaskProcessor } from "../../../types/task-queue";
import { Database } from "../../database";
import { Logger } from "../../../utils/logger";
import { Status, isValidStatusTransition } from "../../../types/status";
import { TwitterClient } from "../../twitter-client";
import { Config } from "../../../types/config";
import { AxiosError } from "axios";


export class PublishProcessor implements TaskProcessor {
  private prisma = Database.getInstance().getPrisma();
  private logger = new Logger("PublishProcessor");
  private twitterClient: TwitterClient;

  constructor(private twitterConfig: Config["twitterConfig"][0]) {
    this.twitterClient = TwitterClient.getInstance(twitterConfig);
  }

  async process(task: Task): Promise<void> {
    const { threadId } = task.data;

    // 获取需要发布的线程
    const thread = await this.prisma.thread.findUnique({
      where: {
        id: threadId,
      },
      include: {
        tweets: {
          orderBy: [
            { isRoot: 'desc' },  // 根推文优先
            { createdAt: 'asc' } // 然后按创建时间排序
          ],
        },
      },
    });

    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    // 开始发布线程
    let previousTweetId: string | undefined;
    for (const tweet of thread.tweets) {
      // 检查状态转换是否有效
      if (!isValidStatusTransition(tweet.status as Status, Status.Published)) {
        this.logger.warn(
          `Invalid status transition for tweet ${tweet.id} from ${tweet.status} to ${Status.Published}`
        );
        continue;
      }

      // 处理媒体文件
      let mediaIds: string[] = [];

      // 准备推文文本
      let tweetText = tweet.translatedText || tweet.text;


      try {
        // 发送推文
        const response = await this.twitterClient.createTweet(
          tweetText,
          previousTweetId,
          mediaIds.length > 0 ? mediaIds : undefined
        );

        if (!response.data?.id) {
          throw new Error("Failed to get tweet ID from response");
        }

        previousTweetId = response.data.id;

        // 更新推文状态
        await this.prisma.tweet.update({
          where: { id: tweet.id },
          data: {
            status: Status.Published,
          },
        });

        this.logger.info(
          `Successfully published tweet ${tweet.id}${
            mediaIds.length > 0
              ? ` with ${mediaIds.length} media attachments`
              : ""
          }`
        );
      } catch (error) {
        const twitterError = error as AxiosError;
        if (twitterError?.response?.status === 429) {
          const resetTime = twitterError.response?.headers?.["x-rate-limit-reset"];
          if (resetTime) {
            const waitTime = parseInt(resetTime) * 1000 - Date.now();
            this.logger.warn(
              `Rate limited while publishing tweet. Reset time: ${new Date(
                parseInt(resetTime) * 1000
              ).toISOString()}`
            );

            // 直接等待到限制解除
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            this.logger.info(
              "Rate limit wait time completed, retrying tweet publication"
            );

            // 重试当前推文
            return await this.process(task);
          }
        }

        this.logger.error(`Failed to publish tweet ${tweet.id}:`, error);
        throw error;
      }
    }

    // 更新线程状态
    await this.prisma.thread.update({
      where: { id: thread.id },
      data: {
        status: Status.Published,
        updatedAt: BigInt(Date.now()),
      },
    });

    this.logger.info(`Successfully published thread ${thread.id}`);
  }
}
