import dotenv from 'dotenv';
import { Config } from '../types/config';

// 加载环境变量
dotenv.config();

function validateConfig(config: Partial<Config>): config is Config {
  const requiredFields: (keyof Config)[] = [
    'twitterConfig',
    'maxTweetsPerRequest',
    'translationApiUrl',
    'moonshot',
    'cron'
  ];

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }

  // 验证 Moonshot 配置
  if (!config.moonshot?.apiKey) {
    throw new Error('Missing required Moonshot API key');
  }

  return true;
}

function loadConfig(): Config {
  try {
    const config: Partial<Config> = {
      twitterConfig: process.env.TWITTER_CONFIG ? 
        JSON.parse(process.env.TWITTER_CONFIG) : [],
      maxTweetsPerRequest: process.env.MAX_TWEETS_PER_REQUEST ? 
        parseInt(process.env.MAX_TWEETS_PER_REQUEST) : 5,
      translationApiUrl: process.env.TRANSLATION_API_URL,
      translationSourceLang: process.env.TRANSLATION_SOURCE_LANG || 'en',
      translationTargetLang: process.env.TRANSLATION_TARGET_LANG || 'zh',
      translationTimeout: process.env.TRANSLATION_TIMEOUT ? 
        parseInt(process.env.TRANSLATION_TIMEOUT) : 5000,
      translationProvider: process.env.TRANSLATION_PROVIDER || 'moonshot',
      moonshot: {
        apiKey: process.env.MOONSHOT_API_KEY || '',
        baseURL: process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1',
        model: process.env.MOONSHOT_MODEL || 'moonshot-v1-8k',
        temperature: process.env.MOONSHOT_TEMPERATURE ? 
          parseFloat(process.env.MOONSHOT_TEMPERATURE) : 0.3
      },
      cron: {
        monitor: process.env.CRON_MONITOR || '*/15 * * * *'      // 每15分钟
      }
    };

    // 验证 Twitter 配置中的 OAuth 信息
    if (config.twitterConfig) {
      for (const twitterConfig of config.twitterConfig) {
        if (!twitterConfig.oauth?.apiKey || !twitterConfig.oauth?.apiSecret || 
            !twitterConfig.oauth?.accessToken || !twitterConfig.oauth?.accessTokenSecret) {
          throw new Error(`Missing OAuth configuration for Twitter account ${twitterConfig.name}`);
        }
      }
    }

    if (validateConfig(config)) {
      return config;
    }

    throw new Error('Invalid configuration');
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const config = loadConfig(); 