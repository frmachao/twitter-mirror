export class DateUtils {
  /**
   * 生成指定时间点的 ISO 字符串
   * @param minutes 相对于当前时间的分钟数，正数表示未来，负数表示过去
   * @returns ISO 格式的时间字符串
   */
  public static getISOTime(minutes: number = 0): string {
    const date = new Date();
    date.setMinutes(date.getMinutes() + minutes);
    return date.toISOString();
  }

  /**
   * 生成当前时间的 ISO 字符串
   */
  public static getCurrentTime(): string {
    return this.getISOTime(0);
  }

  /**
   * 生成5分钟前的时间 ISO 字符串
   */
  public static getFiveMinutesAgo(): string {
    return this.getISOTime(-5);
  }

  /**
   * 生成10分钟前的时间 ISO 字符串
   */
  public static getTenMinutesAgo(): string {
    return this.getISOTime(-10);
  }

  /**
   * 生成15分钟前的时间 ISO 字符串
   */
  public static getFifteenMinutesAgo(): string {
    return this.getISOTime(-15);
  }

  /**
   * 生成30分钟前的时间 ISO 字符串
   */
  public static getThirtyMinutesAgo(): string {
    return this.getISOTime(-30);
  }

  /**
   * 生成1小时前的时间 ISO 字符串
   */
  public static getOneHourAgo(): string {
    return this.getISOTime(-60);
  }

  /**
   * 生成指定时间范围的 ISO 字符串
   * @param startMinutes 开始时间（相对于当前时间的分钟数）
   * @param endMinutes 结束时间（相对于当前时间的分钟数）
   * @returns 包含开始和结束时间的对象
   */
  public static getTimeRange(startMinutes: number, endMinutes: number): { startTime: string; endTime: string } {
    return {
      startTime: this.getISOTime(startMinutes),
      endTime: this.getISOTime(endMinutes)
    };
  }
} 