import { describe, it, expect, beforeEach } from "vitest";
import { InventoryService } from "../src/domain/services/InventoryService";
import { ITEMS, getItem } from "../src/data/items";
import { ItemCategory } from "../src/domain/models/Item";
import { CROPS } from "../src/data/crops";

let inv: InventoryService;

beforeEach(() => {
  inv = new InventoryService(24);
});

// ────────────────────────────────────────────────
// 初始化
// ────────────────────────────────────────────────
describe("InventoryService - 初始化", () => {
  it("默认 capacity=24 且 slots 全部为 null", () => {
    const s = inv.serialize();
    expect(s.capacity).toBe(24);
    expect(s.slots.length).toBe(24);
    expect(s.slots.every((x) => x === null)).toBe(true);
  });

  it("自定义 capacity", () => {
    const inv4 = new InventoryService(4);
    expect(inv4.serialize().capacity).toBe(4);
    expect(inv4.serialize().slots.length).toBe(4);
  });
});

// ────────────────────────────────────────────────
// hotbar - 空/边界
// ────────────────────────────────────────────────
describe("InventoryService - hotbar 边界", () => {
  it("初始 hotbar 全 null，长度恒 8", () => {
    const hb = inv.hotbar();
    expect(hb.length).toBe(8);
    expect(hb).toEqual([null, null, null, null, null, null, null, null]);
  });

  it("只覆盖前 8 格；第 9 格物品不出现在 hotbar", () => {
    // 用 9 个不同物品占 9 格（都 stackable 且各放 1）
    const ids = [
      "dew_radish_seed", "morning_bean_seed", "starberry_seed",
      "ember_tomato_seed", "blue_melon_seed", "gold_corn_seed",
      "amber_pumpkin_seed", "leaf_cabbage_seed", "moon_grape_seed",
    ];
    for (const id of ids) inv.add(id, 1);

    const hb = inv.hotbar();
    expect(hb.length).toBe(8);
    expect(hb[0]).toBe("dew_radish_seed");
    expect(hb[7]).toBe("leaf_cabbage_seed");
    expect(hb.includes("moon_grape_seed")).toBe(false);
  });
});

// ────────────────────────────────────────────────
// add - 基本路径
// ────────────────────────────────────────────────
describe("InventoryService - add 基本路径", () => {
  it("空槽加入", () => {
    const r = inv.add("dew_radish", 5);
    expect(r.ok).toBe(true);
    expect(inv.count("dew_radish")).toBe(5);
    expect(inv.serialize().slots[0]).toEqual({ itemId: "dew_radish", amount: 5 });
  });

  it("连续堆叠（50 + 20 = 70）", () => {
    inv.add("dew_radish", 50);
    inv.add("dew_radish", 20);
    expect(inv.count("dew_radish")).toBe(70);
    const s = inv.serialize();
    expect(s.slots[0]).toEqual({ itemId: "dew_radish", amount: 70 });
    expect(s.slots[1]).toBeNull();
  });

  it("跨槽堆叠：堆满第一格后自动进入第二格（99 + 20 → 99 / 20）", () => {
    inv.add("dew_radish", 99);
    inv.add("dew_radish", 20);
    const s = inv.serialize();
    expect(s.slots[0]).toEqual({ itemId: "dew_radish", amount: 99 });
    expect(s.slots[1]).toEqual({ itemId: "dew_radish", amount: 20 });
  });

  it("amount ≤ 0 视为无操作 ok", () => {
    expect(inv.add("dew_radish", 0).ok).toBe(true);
    expect(inv.add("dew_radish", -5).ok).toBe(true);
    expect(inv.count("dew_radish")).toBe(0);
  });

  it("未知 itemId → throw（编程错误，不入 Result）", () => {
    expect(() => inv.add("not_an_item", 1)).toThrow(/unknown item/);
  });
});

// ────────────────────────────────────────────────
// add - 非堆叠 & maxStack
// ────────────────────────────────────────────────
describe("InventoryService - add maxStack / 非堆叠", () => {
  it("非堆叠工具每件占独立格（hoe ×2）", () => {
    inv.add("hoe", 2);
    const s = inv.serialize();
    expect(s.slots[0]).toEqual({ itemId: "hoe", amount: 1 });
    expect(s.slots[1]).toEqual({ itemId: "hoe", amount: 1 });
  });

  it("amount 超过单格 maxStack → 自动跨多格", () => {
    inv.add("dew_radish", 250); // maxStack=99 → 99 / 99 / 52
    const s = inv.serialize();
    expect(s.slots[0]).toEqual({ itemId: "dew_radish", amount: 99 });
    expect(s.slots[1]).toEqual({ itemId: "dew_radish", amount: 99 });
    expect(s.slots[2]).toEqual({ itemId: "dew_radish", amount: 52 });
    expect(inv.count("dew_radish")).toBe(250);
  });
});

// ────────────────────────────────────────────────
// add - itemId 隔离（不误堆到别物品上）
// ────────────────────────────────────────────────
describe("InventoryService - add itemId 隔离", () => {
  it("不同 itemId 不互相堆叠", () => {
    inv.add("dew_radish", 30);
    inv.add("morning_bean", 30);
    const s = inv.serialize();
    expect(s.slots[0]).toEqual({ itemId: "dew_radish", amount: 30 });
    expect(s.slots[1]).toEqual({ itemId: "morning_bean", amount: 30 });
    expect(inv.count("dew_radish")).toBe(30);
    expect(inv.count("morning_bean")).toBe(30);
  });

  it("同前缀但不同 id 不互相堆叠（dew_radish vs dew_radish_seed）", () => {
    inv.add("dew_radish", 5);
    inv.add("dew_radish_seed", 5);
    expect(inv.count("dew_radish")).toBe(5);
    expect(inv.count("dew_radish_seed")).toBe(5);
    const s = inv.serialize();
    expect(s.slots[0]!.itemId).toBe("dew_radish");
    expect(s.slots[1]!.itemId).toBe("dew_radish_seed");
  });
});

// ────────────────────────────────────────────────
// add - 满包 + 原子性
// ────────────────────────────────────────────────
describe("InventoryService - add 空间不足", () => {
  it("满包 24 格 → INVENTORY_FULL", () => {
    // 前 24 个原有物品逐个占一格塞满，新增材料不影响固定容量。
    expect(ITEMS.length).toBe(30);
    for (const it of ITEMS.slice(0, 24)) {
      const r = inv.add(it.id, it.stackable ? 99 : 1);
      expect(r.ok).toBe(true);
    }
    const r = inv.add("dew_radish", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVENTORY_FULL");
  });

  it("原子性：失败时不改动任何槽（状态不变性）", () => {
    // 24 种物品各占一格塞满
    for (const it of ITEMS.slice(0, 24)) inv.add(it.id, it.maxStack);
    const before = inv.serialize();

    const r = inv.add("dew_radish", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVENTORY_FULL");
    expect(inv.serialize()).toEqual(before);
  });
});

// ────────────────────────────────────────────────
// remove
// ────────────────────────────────────────────────
describe("InventoryService - remove", () => {
  it("成功扣除", () => {
    inv.add("dew_radish", 10);
    const r = inv.remove("dew_radish", 4);
    expect(r.ok).toBe(true);
    expect(inv.count("dew_radish")).toBe(6);
  });

  it("扣至 0 时槽位置为 null", () => {
    inv.add("dew_radish", 5);
    inv.remove("dew_radish", 5);
    expect(inv.count("dew_radish")).toBe(0);
    expect(inv.serialize().slots[0]).toBeNull();
  });

  it("不足 → NOT_ENOUGH，且库存不变", () => {
    inv.add("dew_radish", 3);
    const before = inv.serialize();
    const r = inv.remove("dew_radish", 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_ENOUGH");
    expect(inv.serialize()).toEqual(before);
  });

  it("未知 itemId → count=0 → NOT_ENOUGH（不引入新错误码）", () => {
    const r = inv.remove("not_an_item", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_ENOUGH");
  });

  it("amount ≤ 0 → 无操作 ok", () => {
    inv.add("dew_radish", 5);
    expect(inv.remove("dew_radish", 0).ok).toBe(true);
    expect(inv.remove("dew_radish", -1).ok).toBe(true);
    expect(inv.count("dew_radish")).toBe(5);
  });

  it("跨多格扣减", () => {
    inv.add("dew_radish", 99); // slot0=99
    inv.add("dew_radish", 50); // slot1=50
    const r = inv.remove("dew_radish", 120);
    expect(r.ok).toBe(true);
    expect(inv.count("dew_radish")).toBe(29);
  });
});

// ────────────────────────────────────────────────
// count / hasSpace
// ────────────────────────────────────────────────
describe("InventoryService - count / hasSpace", () => {
  it("空背包 count=0", () => {
    expect(inv.count("hoe")).toBe(0);
  });

  it("多槽累加", () => {
    inv.add("dew_radish", 99);
    inv.add("dew_radish", 40);
    expect(inv.count("dew_radish")).toBe(139);
  });

  it("hasSpace：空背包 stackable 大数量可放", () => {
    expect(inv.hasSpace("dew_radish", 99)).toBe(true);
    expect(inv.hasSpace("dew_radish", 99 * 24)).toBe(true);
  });

  it("hasSpace：满包时返回 false", () => {
    for (const it of ITEMS.slice(0, 24)) inv.add(it.id, it.maxStack);
    expect(inv.hasSpace("dew_radish", 1)).toBe(false);
  });

  it("hasSpace：未知 itemId → false", () => {
    expect(inv.hasSpace("not_an_item", 1)).toBe(false);
  });

  it("hasSpace：amount ≤ 0 → true", () => {
    expect(inv.hasSpace("dew_radish", 0)).toBe(true);
    expect(inv.hasSpace("not_an_item", -1)).toBe(true);
  });
});

// ────────────────────────────────────────────────
// serialize / restore
// ────────────────────────────────────────────────
describe("InventoryService - serialize / restore", () => {
  it("往返一致", () => {
    inv.add("hoe", 1);
    inv.add("dew_radish", 42);
    inv.add("starberry_seed", 7);

    const snap = inv.serialize();
    const inv2 = new InventoryService(24);
    inv2.restore(snap);

    expect(inv2.serialize()).toEqual(snap);
    expect(inv2.count("hoe")).toBe(1);
    expect(inv2.count("dew_radish")).toBe(42);
    expect(inv2.count("starberry_seed")).toBe(7);
  });

  it("restore 会先清空当前状态", () => {
    inv.add("hoe", 1);
    inv.restore({ capacity: 24, slots: new Array(24).fill(null) });
    expect(inv.count("hoe")).toBe(0);
    expect(inv.serialize().slots.every((s) => s === null)).toBe(true);
  });

  it("restore 同步 capacity", () => {
    inv.restore({ capacity: 4, slots: new Array(4).fill(null) });
    expect(inv.serialize().capacity).toBe(4);
    expect(inv.serialize().slots.length).toBe(4);
  });

  it("serialize 返回深拷贝（外部改动不影响内部）", () => {
    inv.add("dew_radish", 10);
    const snap = inv.serialize();
    snap.slots[0]!.amount = 999;
    expect(inv.count("dew_radish")).toBe(10);
  });
});

// ────────────────────────────────────────────────
// ITEMS 数据完整性（与 T1 crops.ts 一致性）
// ────────────────────────────────────────────────
describe("ITEMS 数据完整性", () => {
  it("总计30项（24原物品、3采集材料、1食物、2鱼）", () => {
    expect(ITEMS.length).toBe(30);
    const tools = ITEMS.filter((i) => i.category === ItemCategory.Tool);
    const seeds = ITEMS.filter((i) => i.category === ItemCategory.Seed);
    const crops = ITEMS.filter((i) => i.category === ItemCategory.Crop);
    expect(tools.length).toBe(2);
    expect(seeds.length).toBe(11);
    expect(crops.length).toBe(11);
    expect(ITEMS.filter(i=>i.category===ItemCategory.Material)).toHaveLength(5);
    expect(ITEMS.filter(i=>["silver_crucian","sun_carp"].includes(i.id)).map(i=>i.id)).toEqual(["silver_crucian","sun_carp"]);
  });

  it("所有 id 全局唯一", () => {
    const ids = ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每种作物有对应 seed item（id = crop.id + '_seed'）", () => {
    for (const c of CROPS) {
      const seed = getItem(c.seedItemId);
      expect(seed, `missing seed for ${c.id}`).toBeDefined();
      expect(seed!.category).toBe(ItemCategory.Seed);
    }
  });

  it("每种作物有对应 crop item（id = crop.id）", () => {
    for (const c of CROPS) {
      const crop = getItem(c.id);
      expect(crop, `missing crop item ${c.id}`).toBeDefined();
      expect(crop!.category).toBe(ItemCategory.Crop);
    }
  });

  it("种子 price 与 crops.seedPrice 一致", () => {
    for (const c of CROPS) {
      expect(getItem(c.seedItemId)!.price).toBe(c.seedPrice);
    }
  });

  it("作物 sellPrice 与 crops.sellPrice 一致", () => {
    for (const c of CROPS) {
      expect(getItem(c.id)!.sellPrice).toBe(c.sellPrice);
    }
  });

  it("作物 item price 恒为 0；种子无 sellPrice", () => {
    for (const c of CROPS) {
      expect(getItem(c.id)!.price).toBe(0);
      expect(getItem(c.seedItemId)!.sellPrice).toBeUndefined();
    }
  });

  it("工具字段与 V1.2 冻结表一致（hoe/watering_can）", () => {
    const hoe = getItem("hoe")!;
    expect(hoe.category).toBe(ItemCategory.Tool);
    expect(hoe.price).toBe(0);
    expect(hoe.stackable).toBe(false);
    expect(hoe.maxStack).toBe(1);
    expect(hoe.energyCost).toBe(5);

    const wc = getItem("watering_can")!;
    expect(wc.category).toBe(ItemCategory.Tool);
    expect(wc.price).toBe(0);
    expect(wc.stackable).toBe(false);
    expect(wc.maxStack).toBe(1);
    expect(wc.energyCost).toBe(2);
  });

  it("getItem 未知 id → undefined", () => {
    expect(getItem("not_an_item")).toBeUndefined();
  });
});
