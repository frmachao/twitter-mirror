import dotenv from 'dotenv';
import { Config } from '../types/config';

// 加载环境变量
dotenv.config();

function validateConfig(config: Partial<Config>): config is Config {
  const requiredFields: (keyof Config)[] = [
    'twitterConfig',
    'monitorIntervalMs',
    'maxTweetsPerRequest',
    'translationApiUrl'
  ];

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }

  return true;
}

function loadConfig(): Config {
  try {
    const config: Partial<Config> = {
      twitterConfig: process.env.TWITTER_CONFIG ? 
        JSON.parse(process.env.TWITTER_CONFIG) : [],
      monitorIntervalMs: process.env.MONITOR_INTERVAL_MS ? 
        parseInt(process.env.MONITOR_INTERVAL_MS) : 900000,
      maxTweetsPerRequest: process.env.MAX_TWEETS_PER_REQUEST ? 
        parseInt(process.env.MAX_TWEETS_PER_REQUEST) : 5,
      translationApiUrl: process.env.TRANSLATION_API_URL,
      translationSourceLang: process.env.TRANSLATION_SOURCE_LANG || 'en',
      translationTargetLang: process.env.TRANSLATION_TARGET_LANG || 'zh',
      translationTimeout: process.env.TRANSLATION_TIMEOUT ? 
        parseInt(process.env.TRANSLATION_TIMEOUT) : 5000
    };

    if (validateConfig(config)) {
      return config;
    }

    throw new Error('Invalid configuration');
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const config = loadConfig(); 