export interface PublisherAccount {
  token: string;
  username: string;
}

export interface Config {
  twitterConfig: {
    name: string;
    monitorAccountToken: string;
    publisherAccountToken: string;
    targetUserId: string;
  }[];
  monitorIntervalMs: number;
  maxTweetsPerRequest: number;
  translationApiUrl: string;
  translationSourceLang?: string;
  translationTargetLang?: string;
  translationTimeout?: number;
} 