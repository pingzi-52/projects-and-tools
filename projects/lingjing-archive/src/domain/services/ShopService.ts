import type { ItemDefinition } from "../models/Item";
import type { Result } from "../models/Result";
import type { ShopItem } from "../models/Shop";
import type { Season } from "../models/types";
import type { InventoryService } from "./InventoryService";

/**
 * ShopService 失败码（V1.2 §3.5 只列这两个）。
 * - 未知 itemId 属编程错误 → throw Error（不入 Result）
 */
export const ShopFailReason = {
  GOLD_SHORT: "GOLD_SHORT",
  INVENTORY_FULL: "INVENTORY_FULL",
} as const;

export interface ShopListing {
  item: ItemDefinition;
  price: number;
  affordable: boolean;
}

/**
 * 商店服务（V1.2 §3.5）。
 * 依赖链约束：不 import / 不持有 EconomyService；只读裸 gold，扣款由调用方以 goldLeft 结算。
 */
export class ShopService {
  constructor(
    private readonly shop: { npcName: string; items: readonly ShopItem[] },
    private readonly items: readonly ItemDefinition[],
  ) {}

  /**
   * 按当前季节过滤可售商品。
   * - si.season 未定义 → 恒可售（工具）
   * - si.season === season → 可售（种子）
   * - affordable = gold >= price（qty 默认 1）
   */
  list(gold: number, season: Season): readonly ShopListing[] {
    const out: ShopListing[] = [];
    for (const si of this.shop.items) {
      if (si.season && si.season !== season) continue;
      const item = this.items.find((i) => i.id === si.itemId);
      if (!item) continue;
      out.push({
        item,
        price: si.price,
        affordable: gold >= si.price,
      });
    }
    return out;
  }

  /**
   * 购买（全或无，不做部分购买；V1.2 §3.5 + E5 裁定）。
   * - 不改 gold，只返回 goldLeft（调用方负责结算 EconomyService）
   * - 未知 itemId → throw（编程错误）
   * - amount ≤ 0 → 无操作 ok
   * - gold 不足 → GOLD_SHORT
   * - 背包空间不足 → INVENTORY_FULL（不改 gold、不改背包）
   * - 成功 → { amount, goldLeft = gold - price × amount }
   */
  buy(
    itemId: string,
    amount: number,
    gold: number,
    inventory: InventoryService,
  ): Result<{ amount: number; goldLeft: number }> {
    if (amount <= 0) {
      return { ok: true, value: { amount: 0, goldLeft: gold } };
    }

    const si = this.shop.items.find((s) => s.itemId === itemId);
    if (!si) {
      throw new Error(`ShopService.buy: "${itemId}" not in shop`);
    }

    const total = si.price * amount;
    if (gold < total) {
      return { ok: false, reason: ShopFailReason.GOLD_SHORT };
    }

    if (!inventory.hasSpace(itemId, amount)) {
      return { ok: false, reason: ShopFailReason.INVENTORY_FULL };
    }

    const addR = inventory.add(itemId, amount);
    if (!addR.ok) {
      // hasSpace 与 add 使用同一模拟逻辑，理论不会到这里；防御性返回
      return { ok: false, reason: ShopFailReason.INVENTORY_FULL };
    }

    return { ok: true, value: { amount, goldLeft: gold - total } };
  }
}
