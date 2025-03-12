/**
 * 处理状态枚举
 */
export enum Status {
  Pending = 'pending',
  Analyzed = 'analyzed',
  Translated = 'translated',
  Published = 'published',
  Failed = 'failed'
}

/**
 * 状态转换函数
 */
export function isValidStatusTransition(currentStatus: Status, newStatus: Status): boolean {
  // 定义有效的状态转换
  const validTransitions: Record<Status, Status[]> = {
    [Status.Pending]: [Status.Analyzed, Status.Failed],
    [Status.Analyzed]: [Status.Translated, Status.Failed],
    [Status.Translated]: [Status.Published, Status.Failed],
    [Status.Published]: [Status.Failed],
    [Status.Failed]: []
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * 状态转换错误
 */
export class InvalidStatusTransitionError extends Error {
  constructor(currentStatus: Status, newStatus: Status) {
    super(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    this.name = 'InvalidStatusTransitionError';
  }
} 