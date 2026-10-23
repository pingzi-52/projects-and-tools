import { ItemCategory, type ItemDefinition } from "../models/Item";
import type { CropDefinition, CropState } from "../models/Crop";
import type { Result } from "../models/Result";
import { getCrop, getCropBySeed } from "../../data/crops";
import type { FarmingService } from "./FarmingService";
import type { InventoryService } from "./InventoryService";

/**
 * Economy 结构化最小接口。
 * V1.2 §3.4 写 economy: EconomyService，但为避免 T3 提前耦合 Phase 1 具体实现，
 * 采用结构化接口；T4 时 Phase 1 的 EconomyService（若含 addGold）可直接传入。
 */
export interface EconomyPort {
  addGold(amount: number): void;
}

export interface FarmActionsDeps {
  farming: FarmingService;
  inventory: InventoryService;
  economy: EconomyPort;
  items: readonly ItemDefinition[];
}

export const ActionFailReason = {
  UNKNOWN_ITEM: "UNKNOWN_ITEM",
  UNKNOWN_CROP: "UNKNOWN_CROP",
  NOT_SELLABLE: "NOT_SELLABLE",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  NOT_MATURE: "NOT_MATURE",
  INVENTORY_FULL: "INVENTORY_FULL",
} as const;

export interface FarmActions {
  till(tileId: string): Result;
  plant(tileId: string, seedItemId: string): Result;
  water(tileId: string): Result;
  harvest(tileId: string): Result;
  sell(itemId: string, amount: number): Result;
}

/** 成熟阈值（与 CropService.thresholdOf 逐字一致，含 regrowDays 分支） */
function maturityThreshold(crop: CropState, def: CropDefinition): number {
  if (def.repeatHarvest && crop.harvestedCount > 0) {
    return def.regrowDays ?? def.growDays;
  }
  return def.growDays;
}

export function createFarmActions(deps: FarmActionsDeps): FarmActions {
  const { farming, inventory, economy, items } = deps;

  return {
    till(tileId) {
      return farming.till(tileId);
    },

    /**
     * 播种原子性：
     *   ① getCropBySeed 找不到 → UNKNOWN_CROP
     *   ② inventory.remove(seed, 1) 失败 → 直接返回（种子不丢，地块不变）
     *   ③ farming.plant 失败 → 回滚 add(seed, 1)，种子不丢
     */
    plant(tileId, seedItemId) {
      const cropDef = getCropBySeed(seedItemId);
      if (!cropDef) return { ok: false, reason: ActionFailReason.UNKNOWN_CROP };

      const rm = inventory.remove(seedItemId, 1);
      if (!rm.ok) return rm;

      const p = farming.plant(tileId, cropDef.id);
      if (!p.ok) {
        // 回滚：刚 remove 过 1 个，一定有空位/堆叠位
        inventory.add(seedItemId, 1);
        return p;
      }
      return { ok: true, value: undefined };
    },

    water(tileId) {
      return farming.water(tileId);
    },

    /**
     * 收获（V1.2 §3.4 + D9）：
     *   ① 快照读 tile → 无作物 / 未知作物 / 未成熟 → 直接返回
     *   ② hasSpace 预检 → 背包满 → INVENTORY_FULL，作物留地
     *   ③ farming.harvest → 成功 → inventory.add(作物, yield)
     */
    harvest(tileId) {
      const snap = farming.serialize();
      const tile = snap[tileId];
      if (!tile || !tile.crop) {
        return { ok: false, reason: ActionFailReason.NOT_MATURE };
      }
      const def = getCrop(tile.crop.cropId);
      if (!def) return { ok: false, reason: ActionFailReason.UNKNOWN_CROP };

      // 成熟判断（与 FarmingService.harvest 内部一致）
      if (tile.crop.growthDay < maturityThreshold(tile.crop, def)) {
        return { ok: false, reason: ActionFailReason.NOT_MATURE };
      }

      // 背包预检：满则作物留地（D9）
      if (!inventory.hasSpace(def.id, def.yield)) {
        return { ok: false, reason: ActionFailReason.INVENTORY_FULL };
      }

      const h = farming.harvest(tileId);
      if (!h.ok) return h; // 理论不会到（已快照预检），仍透传

      const addR = inventory.add(def.id, h.value.amount);
      if (!addR.ok) return addR; // 理论不会到（已 hasSpace 预检）

      return { ok: true, value: undefined };
    },

    /**
     * 出售（V1.2 §3.4 + D10，原子性）：
     *   ① amount ≤ 0 → INVALID_AMOUNT
     *   ② 未知 itemId → UNKNOWN_ITEM
     *   ③ category !== Crop 或 sellPrice 未定义 → NOT_SELLABLE（种子/工具统一拒）
     *   ④ inventory.remove 失败 → 透传 NOT_ENOUGH，不改 gold
     *   ⑤ remove 成功 → economy.addGold(sellPrice × amount)
     */
    sell(itemId, amount) {
      if (amount <= 0) {
        return { ok: false, reason: ActionFailReason.INVALID_AMOUNT };
      }

      const def = items.find((i) => i.id === itemId);
      if (!def) return { ok: false, reason: ActionFailReason.UNKNOWN_ITEM };
      if ((def.category !== ItemCategory.Crop && def.category !== ItemCategory.Material) || def.sellPrice === undefined) {
        return { ok: false, reason: ActionFailReason.NOT_SELLABLE };
      }

      const rm = inventory.remove(itemId, amount);
      if (!rm.ok) return rm;

      economy.addGold(def.sellPrice * amount);
      return { ok: true, value: undefined };
    },
  };
}
