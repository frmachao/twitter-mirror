export interface PublisherAccount {
  token: string;
  username: string;
}

export interface Config {
  monitorAccountToken: string;
  targetUserId: string;
  publisherAccounts: PublisherAccount[];
  monitorIntervalMs: number;
  maxTweetsPerRequest: number;
  translationApiUrl: string;
  translationSourceLang?: string;
  translationTargetLang?: string;
  translationTimeout?: number;
} 