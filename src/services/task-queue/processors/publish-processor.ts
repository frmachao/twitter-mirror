import { Task, TaskProcessor } from "../../../types/task-queue";
import { Database } from "../../database";
import { Logger } from "../../../utils/logger";
import { Status, isValidStatusTransition } from "../../../types/status";
import { TwitterClient } from "../../twitter-client";
import { Config } from "../../../types/config";
import path from "path";

interface TwitterError extends Error {
  status?: number;
  headers?: {
    "x-rate-limit-reset"?: string;
  };
}

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
      let videoUrls: string[] = [];

      // 准备推文文本，可能包含视频URL
      let tweetText = tweet.translatedText || tweet.text;

      // if (tweet.mediaUrls) {
      //   try {
      //     const mediaUrls = JSON.parse(tweet.mediaUrls) as string[];
      //     if (mediaUrls.length > 0) {
      //       this.logger.info(
      //         `Processing ${mediaUrls.length} media files for tweet ${tweet.id}`
      //       );

      //       // 上传每个媒体文件
      //       for (const mediaUrl of mediaUrls) {
      //         try {
      //           // 检查是否为视频文件
      //           const fileExtension = path.extname(mediaUrl).toLowerCase();
      //           const isVideo =
      //             fileExtension === ".mp4" ||
      //             fileExtension === ".mov" ||
      //             fileExtension === ".avi" ||
      //             mediaUrl.includes("video");

      //           if (isVideo) {
      //             this.logger.info(
      //               `Found video file, will append URL to tweet text: ${mediaUrl}`
      //             );
      //             videoUrls.push(mediaUrl);
      //             continue;
      //           }

      //           const mediaId = await this.twitterClient.uploadMedia(mediaUrl);
      //           mediaIds.push(mediaId);
      //         } catch (mediaError) {
      //           const twitterError = mediaError as TwitterError;
      //           if (twitterError.status === 429) {
      //             const resetTime =
      //               twitterError.headers?.["x-rate-limit-reset"];
      //             if (resetTime) {
      //               const waitTime = parseInt(resetTime) * 1000 - Date.now();
      //               this.logger.warn(
      //                 `Rate limited while uploading media. Reset time: ${new Date(
      //                   parseInt(resetTime) * 1000
      //                 ).toISOString()}`
      //               );

      //               // 直接等待到限制解除
      //               await new Promise((resolve) =>
      //                 setTimeout(resolve, waitTime)
      //               );
      //               this.logger.info(
      //                 "Rate limit wait time completed, retrying media upload"
      //               );

      //               // 重试上传
      //               const mediaId = await this.twitterClient.uploadMedia(
      //                 mediaUrl
      //               );
      //               mediaIds.push(mediaId);
      //               continue;
      //             }
      //           }

      //           // 检查是否是视频文件错误
      //           if (
      //             mediaError instanceof Error &&
      //             mediaError.message.includes("Video files are not supported")
      //           ) {
      //             // 尝试提取URL并添加到视频URL列表
      //             const mediaUrl = (mediaError.message.match(
      //               /Video files are not supported: (.+)/
      //             ) || [])[1];
      //             if (mediaUrl) {
      //               this.logger.info(
      //                 `Found video file from error, will append URL to tweet text: ${mediaUrl}`
      //               );
      //               videoUrls.push(mediaUrl);
      //             } else {
      //               this.logger.warn(`Skipping video file: ${mediaUrl}`);
      //             }
      //           } else {
      //             this.logger.error(
      //               `Failed to upload media ${mediaUrl}:`,
      //               mediaError
      //             );
      //           }
      //         }
      //       }
      //     }
      //   } catch (parseError) {
      //     this.logger.error(
      //       `Failed to parse mediaUrls for tweet ${tweet.id}:`,
      //       parseError
      //     );
      //   }
      // }
      // // Twitter的字符限制是280个字符
      // const TWITTER_CHAR_LIMIT = 280;
      // // 如果有视频URL，尝试添加到推文文本末尾
      // if (videoUrls.length > 0) {
      //   // 为视频URL添加前缀
      //   const videoPrefix =
      //     videoUrls.length === 1 ? "\n\n视频: " : "\n\n视频链接: ";

      //   // 计算添加视频URL后的总长度
      //   const videoUrlsText = videoPrefix + videoUrls.join(" ");
      //   const totalLength = tweetText.length + videoUrlsText.length;

      //   // 检查是否超出字符限制
      //   if (totalLength <= TWITTER_CHAR_LIMIT) {
      //     tweetText += videoUrlsText;
      //     this.logger.info(
      //       `Added ${videoUrls.length} video URLs to tweet text`
      //     );
      //   } else {
      //     this.logger.warn(
      //       `Cannot add video URLs to tweet text: would exceed ${TWITTER_CHAR_LIMIT} character limit`
      //     );
      //   }
      // }

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
        const twitterError = error as TwitterError;
        if (twitterError.status === 429) {
          const resetTime = twitterError.headers?.["x-rate-limit-reset"];
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
