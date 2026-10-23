import { describe, it, expect, beforeEach } from "vitest";
import { ShopService } from "../src/domain/services/ShopService";
import { InventoryService } from "../src/domain/services/InventoryService";
import { SHOP_HOMU } from "../src/data/shops";
import { ITEMS, getItem } from "../src/data/items";

const shop = new ShopService(SHOP_HOMU, ITEMS);

let inv: InventoryService;

beforeEach(() => {
  inv = new InventoryService(24);
});

// ────────────────────────────────────────────────
// list
// ────────────────────────────────────────────────
describe("ShopService.list - 季节过滤", () => {
  it("spring：3 春种子 + 2 工具 = 5 项", () => {
    const ids = shop.list(1000, "spring").map((l) => l.item.id);
    expect(ids).toContain("dew_radish_seed");
    expect(ids).toContain("morning_bean_seed");
    expect(ids).toContain("starberry_seed");
    expect(ids).toContain("hoe");
    expect(ids).toContain("watering_can");
    expect(ids.length).toBe(5);
  });

  it("summer：3 夏种子 + 2 工具 = 5 项", () => {
    const ids = shop.list(1000, "summer").map((l) => l.item.id);
    expect(ids).toContain("ember_tomato_seed");
    expect(ids).toContain("blue_melon_seed");
    expect(ids).toContain("gold_corn_seed");
    expect(ids).toContain("hoe");
    expect(ids).toContain("watering_can");
    expect(ids.length).toBe(5);
  });

  it("winter：2 冬种子 + 2 工具 = 4 项", () => {
    const ids = shop.list(1000, "winter").map((l) => l.item.id);
    expect(ids).toContain("snow_flower_seed");
    expect(ids).toContain("ice_grass_seed");
    expect(ids).toContain("hoe");
    expect(ids).toContain("watering_can");
    expect(ids.length).toBe(4);
  });
});

describe("ShopService.list - affordable", () => {
  it("gold 不足 → affordable=false；gold 足够 → true", () => {
    const poor = shop.list(5, "spring");
    expect(poor.find((l) => l.item.id === "dew_radish_seed")!.affordable).toBe(false);
    expect(poor.find((l) => l.item.id === "starberry_seed")!.affordable).toBe(false);

    const rich = shop.list(1000, "spring");
    expect(rich.every((l) => l.affordable)).toBe(true);
  });

  it("边界：gold === price → affordable=true", () => {
    const seed = getItem("dew_radish_seed")!;
    const list = shop.list(seed.price, "spring");
    expect(list.find((l) => l.item.id === "dew_radish_seed")!.affordable).toBe(true);
  });
});

// ────────────────────────────────────────────────
// buy
// ────────────────────────────────────────────────
describe("ShopService.buy", () => {
  it("gold 不足 → GOLD_SHORT，且不扣库存", () => {
    const r = shop.buy("dew_radish_seed", 1, 5, inv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("GOLD_SHORT");
    expect(inv.count("dew_radish_seed")).toBe(0);
  });

  it("背包满 → INVENTORY_FULL，且不扣库存", () => {
    // 24 格全占（非堆叠 maxStack=1；堆叠 maxStack=99，各占 1 格）
    for (const it of ITEMS) inv.add(it.id, it.stackable ? 99 : 1);
    const r = shop.buy("dew_radish_seed", 1, 1000, inv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVENTORY_FULL");
  });

  it("成功：返回 {amount, goldLeft}，物品入包，调用方不做扣款（本服务不改 gold）", () => {
    const seed = getItem("dew_radish_seed")!;
    const r = shop.buy("dew_radish_seed", 3, 100, inv);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.amount).toBe(3);
      expect(r.value.goldLeft).toBe(100 - seed.price * 3);
    }
    expect(inv.count("dew_radish_seed")).toBe(3);
  });

  it("未知商品 → throw（编程错误）", () => {
    expect(() => shop.buy("not_an_item", 1, 1000, inv)).toThrow(/not in shop/);
    expect(() => shop.buy("dew_radish", 1, 1000, inv)).toThrow(/not in shop/); // 作物成品不在货架
  });

  it("amount ≤ 0 → 无操作 ok，返回 amount=0", () => {
    const r = shop.buy("dew_radish_seed", 0, 100, inv);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.amount).toBe(0);
      expect(r.value.goldLeft).toBe(100);
    }
    expect(inv.count("dew_radish_seed")).toBe(0);
  });

  it("全或无：买 250 个跨 3 格，未满时成功；超 maxStack 时按实际格子数入包", () => {
    const seed = getItem("dew_radish_seed")!;
    const r = shop.buy("dew_radish_seed", 250, 100000, inv);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.amount).toBe(250);
      expect(r.value.goldLeft).toBe(100000 - seed.price * 250);
    }
    expect(inv.count("dew_radish_seed")).toBe(250);
  });
});

// ────────────────────────────────────────────────
// 数据一致性（SHOP_HOMU ↔ ITEMS）
// ────────────────────────────────────────────────
describe("SHOP_HOMU 数据一致性", () => {
  it("所有货架 itemId 均存在于 ITEMS 表", () => {
    for (const si of SHOP_HOMU.items) {
      expect(getItem(si.itemId), `missing item ${si.itemId}`).toBeDefined();
    }
  });

  it("货架价格与 ITEMS.price 一致", () => {
    for (const si of SHOP_HOMU.items) {
      const item = getItem(si.itemId)!;
      expect(si.price).toBe(item.price);
    }
  });

  it("种子有 season；工具有 price=0 且 season=undefined", () => {
    for (const si of SHOP_HOMU.items) {
      const item = getItem(si.itemId)!;
      if (item.category === "seed") {
        expect(si.season).toBeDefined();
      } else {
        expect(si.season).toBeUndefined();
        expect(si.price).toBe(0);
      }
    }
  });

  it("stock 恒 99999", () => {
    for (const si of SHOP_HOMU.items) {
      expect(si.stock).toBe(99999);
    }
  });
});
