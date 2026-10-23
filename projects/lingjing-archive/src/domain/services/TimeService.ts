import type { DateInfo, Season } from "../models/types";

/** 每个季节的天数 */
export const DAYS_PER_SEASON = 14;

export const SEASONS: readonly Season[] = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const;

/**
 * 游戏内时间（单一事实源）。
 * 纯逻辑、无 Phaser 依赖，可单元测试。
 */
export class TimeService {
  private day: number;

  constructor(initialDay = 1) {
    this.day = Math.max(1, Math.floor(initialDay));
  }

  get date(): DateInfo {
    const index =
      Math.floor((this.day - 1) / DAYS_PER_SEASON) % SEASONS.length;
    return { day: this.day, season: SEASONS[index] };
  }

  /** 前进一天，返回最新日期 */
  advanceDay(): DateInfo {
    this.day += 1;
    return this.date;
  }

  setDay(day: number): void {
    this.day = Math.max(1, Math.floor(day));
  }
}
