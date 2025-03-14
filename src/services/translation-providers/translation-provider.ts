/**
 * 翻译服务提供者接口
 */
export interface TranslationProvider {
  /**
   * 翻译文本
   * @param text 要翻译的文本
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @returns 翻译后的文本
   */
  translate(text: string, sourceLang: string, targetLang: string): Promise<string>;
} 