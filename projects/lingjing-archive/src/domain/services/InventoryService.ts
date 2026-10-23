import type {
  InventorySlot,
  InventoryState,
  ItemDefinition,
} from "../models/Item";
import type { Result } from "../models/Result";
import { getItem } from "../../data/items";

export const InventoryFailReason = {
  INVENTORY_FULL: "INVENTORY_FULL",
  NOT_ENOUGH: "NOT_ENOUGH",
} as const;

type Slot = InventorySlot | null;

/**
 * 背包服务（V1.2 §3.3）。
 * - 容量默认 24
 * - add 原子性：要么整体放入，要么整体失败（不改动任何槽）
 * - 堆叠优先，再占空槽
 * - 未引入 V1.2 之外的新错误码
 */
export class InventoryService {
  private slots: Slot[];

  constructor(private capacity = 24) {
    this.slots = new Array<Slot>(capacity).fill(null);
  }

  /** 只读深拷贝（内部用于原子性沙盘 / serialize） */
  private snapshot(): Slot[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  /**
   * 在副本 work 上模拟放入 amount，成功返回 true 且就地修改 work；
   * 失败返回 false（work 已被部分污染，由调用方丢弃）。
   */
  private tryPlaceInto(
    work: Slot[],
    itemId: string,
    amount: number,
    def: ItemDefinition,
  ): boolean {
    let remaining = amount;

    // 第一优先：堆叠到同 itemId 未满槽
    if (def.stackable) {
      for (let i = 0; i < work.length && remaining > 0; i++) {
        const s = work[i];
        if (!s || s.itemId !== itemId) continue;
        if (s.amount >= def.maxStack) continue;
        const space = def.maxStack - s.amount;
        const put = Math.min(space, remaining);
        s.amount += put;
        remaining -= put;
      }
    }

    // 第二优先：空槽新增
    while (remaining > 0) {
      const idx = work.findIndex((s) => s === null);
      if (idx === -1) return false;
      const put = Math.min(def.maxStack, remaining);
      work[idx] = { itemId, amount: put };
      remaining -= put;
    }

    return true;
  }

  /**
   * 加入物品。
   * - amount ≤ 0 → 无操作 ok
   * - 未知 itemId → throw（编程错误，非业务失败）
   * - 空间不足 → INVENTORY_FULL，且不改动任何槽
   */
  add(itemId: string, amount: number): Result {
    if (amount <= 0) return { ok: true, value: undefined };

    const def = getItem(itemId);
    if (!def) {
      throw new Error(`InventoryService: unknown item "${itemId}"`);
    }

    const work = this.snapshot();
    if (!this.tryPlaceInto(work, itemId, amount, def)) {
      return { ok: false, reason: InventoryFailReason.INVENTORY_FULL };
    }
    this.slots = work;
    return { ok: true, value: undefined };
  }

  /**
   * 移除物品（从尾部倒序扣，保持前 8 格稳定）。
   * - amount ≤ 0 → 无操作 ok
   * - 数量不足（含未知 itemId）→ NOT_ENOUGH，不改动任何槽
   */
  remove(itemId: string, amount: number): Result {
    if (amount <= 0) return { ok: true, value: undefined };
    if (this.count(itemId) < amount) {
      return { ok: false, reason: InventoryFailReason.NOT_ENOUGH };
    }

    let remaining = amount;
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const s = this.slots[i];
      if (!s || s.itemId !== itemId) continue;
      const take = Math.min(s.amount, remaining);
      s.amount -= take;
      remaining -= take;
      if (s.amount === 0) this.slots[i] = null;
    }
    return { ok: true, value: undefined };
  }

  /** 背包中某物品总数 */
  count(itemId: string): number {
    let n = 0;
    for (const s of this.slots) {
      if (s && s.itemId === itemId) n += s.amount;
    }
    return n;
  }

  /** 给定数量是否能完整放入（模拟，不改动背包） */
  hasSpace(itemId: string, amount: number): boolean {
    if (amount <= 0) return true;
    const def = getItem(itemId);
    if (!def) return false;
    const work = this.snapshot();
    return this.tryPlaceInto(work, itemId, amount, def);
  }

  /** 快捷栏：前 8 格 itemId（空为 null），长度恒 8 */
  hotbar(): (string | null)[] {
    const out: (string | null)[] = [];
    for (let i = 0; i < 8; i++) {
      const s = this.slots[i];
      out.push(s ? s.itemId : null);
    }
    return out;
  }

  serialize(): InventoryState {
    return {
      capacity: this.capacity,
      slots: this.snapshot(),
    };
  }

  restore(state: InventoryState): void {
    this.capacity = state.capacity;
    this.slots = state.slots.map((s) => (s ? { ...s } : null));
  }
}
