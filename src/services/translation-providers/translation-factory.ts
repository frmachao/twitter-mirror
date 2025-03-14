import { TranslationProvider } from './translation-provider';
import { MoonshotTranslationProvider } from './moonshot-provider';
import { config } from '../../config';

/**
 * 翻译服务工厂
 */
export class TranslationFactory {
  private static instance: TranslationFactory;
  private providers: Map<string, TranslationProvider> = new Map();

  private constructor() {
    // 注册翻译提供者
    this.registerProvider('moonshot', new MoonshotTranslationProvider());
  }

  public static getInstance(): TranslationFactory {
    if (!TranslationFactory.instance) {
      TranslationFactory.instance = new TranslationFactory();
    }
    return TranslationFactory.instance;
  }

  /**
   * 注册翻译提供者
   * @param name 提供者名称
   * @param provider 提供者实例
   */
  public registerProvider(name: string, provider: TranslationProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * 获取翻译提供者
   * @param name 提供者名称，默认使用配置中的提供者
   * @returns 翻译提供者实例
   */
  public getProvider(name?: string): TranslationProvider {
    const providerName = name || config.translationProvider || 'moonshot';
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      throw new Error(`Translation provider '${providerName}' not found`);
    }
    
    return provider;
  }
} 