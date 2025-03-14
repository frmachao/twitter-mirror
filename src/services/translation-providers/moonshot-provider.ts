import { OpenAI } from 'openai';
import { Logger } from '../../utils/logger';
import { TranslationProvider } from './translation-provider';
import { config } from '../../config';

export class MoonshotTranslationProvider implements TranslationProvider {
  private client: OpenAI;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('MoonshotTranslationProvider');
    this.client = new OpenAI({
      apiKey: config.moonshot.apiKey,
      baseURL: config.moonshot.baseURL || 'https://api.moonshot.cn/v1',
    });
  }

  public async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    try {
      const systemPrompt = `请你扮演一位推文本地化翻译助手，将推文 text 从 ${sourceLang} 翻译为 ${targetLang}的推文；

注意： 
- 你要在推文长度限制范围内输出翻译后的推文，要考虑不同语言的推文长度限制不同
- 正文中的链接保持原有的结构
- 除了原文中的内容，不要添加任何和原文无关的内容`;

      const completion = await this.client.chat.completions.create({
        model: config.moonshot.model || 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: config.moonshot.temperature || 0.3
      });

      const translatedText = completion.choices[0].message.content;
      
      if (!translatedText) {
        throw new Error('Moonshot API did not return translated text');
      }

      return translatedText;
    } catch (error) {
      this.logger.error('Error in Moonshot translation:', error);
      throw new Error(`Moonshot translation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 