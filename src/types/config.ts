export interface PublisherAccount {
  token: string;
  username: string;
}

export interface TwitterConfig {
  name: string;
  monitorAccountToken: string;
  publisherAccountToken: string;
  targetUserId: string;
  oauth: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  };
}

export interface CronConfig {
  monitor: string;      // 监控服务执行间隔
}

export interface MoonshotConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
}

export interface Config {
  twitterConfig: TwitterConfig[];
  maxTweetsPerRequest: number;
  translationApiUrl: string;
  translationSourceLang?: string;
  translationTargetLang?: string;
  translationTimeout?: number;
  translationProvider?: string;  // 翻译服务提供者，默认为 'moonshot'
  moonshot: MoonshotConfig;      // Moonshot API 配置
  cron: CronConfig;              // 只保留 Monitor 服务的 Cron 配置
} 