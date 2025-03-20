import { Client } from 'twitter-api-sdk';
import { Config } from '../types/config';
import axios, { AxiosError } from 'axios';
import oAuth1a from 'twitter-v1-oauth';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

export class TwitterClient {
  private static instances: Map<string, TwitterClient> = new Map();
  private monitorClient: Client;
  private logger: Logger;

  private constructor(private twitterConfig: Config['twitterConfig'][0]) {
    this.monitorClient = new Client(twitterConfig.BearerToken);
    this.logger = new Logger(`TwitterClient:${twitterConfig.name}`);
  }

  public static getInstance(twitterConfig: Config['twitterConfig'][0]): TwitterClient {
    if (!this.instances.has(twitterConfig.targetUserId)) {
      this.instances.set(twitterConfig.targetUserId, new TwitterClient(twitterConfig));
    }
    return this.instances.get(twitterConfig.targetUserId)!;
  }

  public getMonitorClient(): Client {
    return this.monitorClient;
  }

  /**
   * 上传媒体文件到 Twitter
   * @param mediaPath 媒体文件路径或URL
   * @returns 媒体ID
   */
  public async uploadMedia(mediaPath: string): Promise<string> {
    let mediaBuffer: Buffer | null = null;
    
    try {
      this.logger.info(`[${this.twitterConfig.name}] Uploading media: ${mediaPath}`);
      
      // 准备 OAuth 选项
      const oAuthOptions = {
        api_key: this.twitterConfig.oauth.apiKey,
        api_secret_key: this.twitterConfig.oauth.apiSecret,
        access_token: this.twitterConfig.oauth.accessToken,
        access_token_secret: this.twitterConfig.oauth.accessTokenSecret,
      };

      // 判断是本地文件还是URL
      let mediaType: string;
      
      if (mediaPath.startsWith('http')) {
        // 检查URL是否指向视频文件
        const fileExtension = path.extname(mediaPath).toLowerCase();
        if (fileExtension === '.mp4' || fileExtension === '.mov' || fileExtension === '.avi') {
          throw new Error(`Video files are not supported: ${mediaPath}`);
        }
        
        // 如果是URL，先下载
        const response = await axios.get(mediaPath, { responseType: 'arraybuffer' });
        mediaBuffer = Buffer.from(response.data, 'binary');
        mediaType = response.headers['content-type'];
        
        // 再次检查内容类型是否为视频
        if (mediaType && mediaType.startsWith('video/')) {
          throw new Error(`Video content type not supported: ${mediaType}`);
        }
      } else {
        // 如果是本地文件，检查文件类型
        const ext = path.extname(mediaPath).toLowerCase();
        if (ext === '.mp4' || ext === '.mov' || ext === '.avi') {
          throw new Error(`Video files are not supported: ${mediaPath}`);
        }
        
        // 读取文件
        mediaBuffer = fs.readFileSync(mediaPath);
        
        // 根据文件扩展名确定媒体类型
        switch (ext) {
          case '.jpg':
          case '.jpeg':
            mediaType = 'image/jpeg';
            break;
          case '.png':
            mediaType = 'image/png';
            break;
          case '.gif':
            mediaType = 'image/gif';
            break;
          default:
            mediaType = 'application/octet-stream';
        }
      }

      // 创建表单数据
      const form = new FormData();
      form.append('media', mediaBuffer, {
        filename: path.basename(mediaPath),
        contentType: mediaType,
      });

      // 获取 OAuth 授权头
      const url = 'https://upload.twitter.com/1.1/media/upload.json';
      const method = 'POST';
      const authorization = oAuth1a({ method, url }, oAuthOptions);

      // 发送请求
      const uploadResponse = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': authorization,
        },
      });

      if (!uploadResponse.data?.media_id_string) {
        throw new Error('Failed to get media ID from response');
      }

      this.logger.info(`[${this.twitterConfig.name}] Successfully uploaded media, got media_id: ${uploadResponse.data.media_id_string}`);
      return uploadResponse.data.media_id_string;
    } catch (error) {
      this.logger.error(`[${this.twitterConfig.name}] Error uploading media:`, error);
      throw error;
    } finally {
      // 释放资源
      mediaBuffer = null;
    }
  }

  /**
   * 使用 OAuth 1.0a 发送推文
   * @param text 推文内容
   * @param replyToId 回复的推文ID
   * @param mediaIds 媒体ID数组
   * @returns 发送的推文数据
   */
  public async createTweet(text: string, replyToId?: string, mediaIds?: string[]): Promise<any> {
    try {
      const url = 'https://api.twitter.com/2/tweets';
      const method = 'POST';
      
      // 准备请求数据
      const data: any = { text };
      
      // 添加回复信息
      if (replyToId) {
        data.reply = { in_reply_to_tweet_id: replyToId };
      }
      
      // 添加媒体信息
      if (mediaIds && mediaIds.length > 0) {
        data.media = { media_ids: mediaIds };
      }

      // 准备 OAuth 选项
      const oAuthOptions = {
        api_key: this.twitterConfig.oauth.apiKey,
        api_secret_key: this.twitterConfig.oauth.apiSecret,
        access_token: this.twitterConfig.oauth.accessToken,
        access_token_secret: this.twitterConfig.oauth.accessTokenSecret,
      };

      // 获取 OAuth 授权头
      const authorization = oAuth1a({ method, url }, oAuthOptions);
      this.logger.info(`Sending tweet data: ${JSON.stringify(data)}`);
      // 发送请求
      const response = await axios.post(url, data, {
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
        },
      });

      this.logger.info(`[${this.twitterConfig.name}] Successfully created tweet${replyToId ? ` in reply to ${replyToId}` : ''}`);
      return response.data;
    } catch (error) {
      const twitterError = error as AxiosError;
      this.logger.error(`[${this.twitterConfig.name}] Error creating tweet:`, twitterError?.message);
      throw error;
    }
  }
} 