import { Client } from 'twitter-api-sdk';
import { Config } from '../types/config';

export class TwitterClient {
  private static instance: TwitterClient;
  private monitorClient: Client;
  private publisherClient: Client;

  private constructor(twitterConfig: Config['twitterConfig'][0]) {
    this.monitorClient = new Client(twitterConfig.monitorAccountToken);
    this.publisherClient = new Client(twitterConfig.publisherAccountToken);
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

  public getPublisherClient(): Client {
    return this.publisherClient;
  }
} 