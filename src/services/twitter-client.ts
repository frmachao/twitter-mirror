import { Client } from 'twitter-api-sdk';
import { config } from '../config';

export class TwitterClient {
  private static instance: TwitterClient;
  private monitorClient: Client;
  private publisherClients: Map<string, Client>;

  private constructor() {
    this.monitorClient = new Client(config.monitorAccountToken);
    this.publisherClients = new Map(
      config.publisherAccounts.map(account => [
        account.token,
        new Client(account.token)
      ])
    );
  }

  public static getInstance(): TwitterClient {
    if (!TwitterClient.instance) {
      TwitterClient.instance = new TwitterClient();
    }
    return TwitterClient.instance;
  }

  public getMonitorClient(): Client {
    return this.monitorClient;
  }

  public getPublisherClient(token: string): Client | undefined {
    return this.publisherClients.get(token);
  }

  public getAllPublisherClients(): Client[] {
    return Array.from(this.publisherClients.values());
  }
} 