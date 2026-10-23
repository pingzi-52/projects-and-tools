/**
 * 经济系统（金币的单一事实源）。
 * 纯逻辑、无 Phaser 依赖，可单元测试。
 */
export class EconomyService {
  private gold: number;

  constructor(initialGold = 0) {
    this.gold = Math.max(0, Math.round(initialGold));
  }

  get goldValue(): number {
    return this.gold;
  }

  /** 增加金币（结果不会低于 0），返回新余额 */
  addGold(amount: number): number {
    this.gold = Math.max(0, this.gold + Math.round(amount));
    return this.gold;
  }

  /** 花费金币；余额不足时失败，返回是否成功 */
  spendGold(cost: number): boolean {
    const c = Math.round(cost);
    if (c <= 0 || this.gold < c) {
      return false;
    }
    this.gold -= c;
    return true;
  }

  setGold(value: number): void {
    this.gold = Math.max(0, Math.round(value));
  }
}
