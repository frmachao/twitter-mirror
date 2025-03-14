import { Client } from 'twitter-api-sdk';
import { Config } from '../types/config';
import axios from 'axios';
import oAuth1a from 'twitter-v1-oauth';
import { Logger } from '../utils/logger';

export class TwitterClient {
  private static instance: TwitterClient;
  private monitorClient: Client;
  private logger: Logger;

  private constructor(private twitterConfig: Config['twitterConfig'][0]) {
    this.monitorClient = new Client(twitterConfig.monitorAccountToken);
    this.logger = new Logger('TwitterClient');
  }

  public static getInstance(twitterConfig: Config['twitterConfig'][0]): TwitterClient {
    if (!TwitterClient.instance) {
      TwitterClient.instance = new TwitterClient(twitterConfig);
    }
    return TwitterClient.instance;
  }

  public getMonitorClient(): Client {
    return this.monitorClient;
  }

  /**
   * 使用 OAuth 1.0a 发送推文
   * @param text 推文内容
   * @param replyToId 回复的推文ID
   * @returns 发送的推文数据
   */
  public async createTweet(text: string, replyToId?: string): Promise<any> {
    try {
      const url = 'https://api.twitter.com/2/tweets';
      const method = 'POST';
      
      // 准备请求数据
      const data: any = { text };
      if (replyToId) {
        data.reply = { in_reply_to_tweet_id: replyToId };
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

      // 发送请求
      const response = await axios.post(url, data, {
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error creating tweet:', error);
      throw error;
    }
  }
} 