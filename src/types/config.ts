export interface PublisherAccount {
  token: string;
  username: string;
}

export interface CronConfig {
  monitor: string;      // 监控服务执行间隔
  analyzer: string;     // 线程分析服务执行间隔
  translator: string;   // 翻译服务执行间隔
  publisher: string;    // 发布服务执行间隔
}

export interface Config {
  twitterConfig: {
    name: string;
    monitorAccountToken: string;
    publisherAccountToken: string;
    targetUserId: string;
  }[];
  maxTweetsPerRequest: number;
  translationApiUrl: string;
  translationSourceLang?: string;
  translationTargetLang?: string;
  translationTimeout?: number;
  cron: CronConfig;    // 添加 Cron 配置
} 