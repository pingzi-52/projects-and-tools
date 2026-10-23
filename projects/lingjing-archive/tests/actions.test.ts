import { describe, it, expect, beforeEach } from "vitest";
import { FarmingService } from "../src/domain/services/FarmingService";
import { CropService } from "../src/domain/services/CropService";
import { InventoryService } from "../src/domain/services/InventoryService";
import {
  createFarmActions,
  type EconomyPort,
  type FarmActions,
} from "../src/domain/services/FarmActions";
import { CROPS } from "../src/data/crops";
import { ITEMS, getItem } from "../src/data/items";
import type { FarmTileState } from "../src/domain/models/Crop";

// 记录 addGold 调用的假 Economy
function makeEconomy() {
  let gold = 0;
  const port: EconomyPort = { addGold: (n) => { gold += n; } };
  return { port, getGold: () => gold };
}

let tiles: Map<string, FarmTileState>;
let farming: FarmingService;
let inventory: InventoryService;
let economy: ReturnType<typeof makeEconomy>;
let actions: FarmActions;

beforeEach(() => {
  tiles = new Map();
  farming = new FarmingService(tiles, new CropService(CROPS));
  inventory = new InventoryService(24);
  economy = makeEconomy();
  actions = createFarmActions({
    farming,
    inventory,
    economy: economy.port,
    items: ITEMS,
  });
});

// ────────────────────────────────────────────────
// till / water 透传
// ────────────────────────────────────────────────
describe("FarmActions - till / water 透传", () => {
  it("till 透传成功", () => {
    const r = actions.till("0_0");
    expect(r.ok).toBe(true);
    expect(tiles.get("0_0")!.tilled).toBe(true);
  });

  it("water 未开垦 → NOT_TILLED", () => {
    const r = actions.water("0_0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_TILLED");
  });
});

// ────────────────────────────────────────────────
// plant 原子性
// ────────────────────────────────────────────────
describe("FarmActions.plant - 原子性", () => {
  it("成功：扣 1 个种子 + 地块有作物", () => {
    inventory.add("dew_radish_seed", 3);
    actions.till("0_0");
    const r = actions.plant("0_0", "dew_radish_seed");
    expect(r.ok).toBe(true);
    expect(inventory.count("dew_radish_seed")).toBe(2);
    expect(tiles.get("0_0")!.crop!.cropId).toBe("dew_radish");
  });

  it("无种子 → NOT_ENOUGH，地块不变", () => {
    actions.till("0_0");
    const r = actions.plant("0_0", "dew_radish_seed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_ENOUGH");
    expect(tiles.get("0_0")!.crop).toBeUndefined();
  });

  it("未开垦 → NOT_TILLED，种子回滚", () => {
    inventory.add("dew_radish_seed", 1);
    const r = actions.plant("0_0", "dew_radish_seed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_TILLED");
    expect(inventory.count("dew_radish_seed")).toBe(1); // 回滚
  });

  it("已有作物 → ALREADY_HAS_CROP，种子回滚", () => {
    inventory.add("dew_radish_seed", 2);
    actions.till("0_0");
    actions.plant("0_0", "dew_radish_seed");
    const r = actions.plant("0_0", "dew_radish_seed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ALREADY_HAS_CROP");
    expect(inventory.count("dew_radish_seed")).toBe(1);
  });

  it("未知种子 id → UNKNOWN_CROP，背包不变", () => {
    const r = actions.plant("0_0", "not_a_seed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNKNOWN_CROP");
  });
});

// ────────────────────────────────────────────────
// harvest
// ────────────────────────────────────────────────
describe("FarmActions.harvest", () => {
  function growRadishReady() {
    actions.till("0_0");
    inventory.add("dew_radish_seed", 1);
    actions.plant("0_0", "dew_radish_seed");
    // 直接拉到成熟（radish.growDays = 4）
    tiles.get("0_0")!.crop!.growthDay = 4;
  }

  it("未成熟 → NOT_MATURE，作物留地", () => {
    actions.till("0_0");
    inventory.add("dew_radish_seed", 1);
    actions.plant("0_0", "dew_radish_seed");
    const r = actions.harvest("0_0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_MATURE");
    expect(tiles.get("0_0")!.crop).toBeDefined();
  });

  it("成功：作物入包（yield），地块清空（一次性）", () => {
    growRadishReady();
    const r = actions.harvest("0_0");
    expect(r.ok).toBe(true);
    // dew_radish.yield = 1
    expect(inventory.count("dew_radish")).toBe(1);
    expect(tiles.get("0_0")!.crop).toBeUndefined();
  });

  it("背包满 → INVENTORY_FULL（D9），作物留地", () => {
    growRadishReady();
    // 塞满 24 格
    for (const it of ITEMS) inventory.add(it.id, it.stackable ? 99 : 1);

    const before = { ...tiles.get("0_0")!.crop! };
    const r = actions.harvest("0_0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVENTORY_FULL");
    // 作物仍在
    expect(tiles.get("0_0")!.crop).toEqual(before);
  });

  it("重复作物成熟收获 → cropAfter 归零 + harvestedCount+1；作物入包", () => {
    actions.till("0_0");
    inventory.add("starberry_seed", 1);
    actions.plant("0_0", "starberry_seed");
    tiles.get("0_0")!.crop!.growthDay = 8; // starberry.growDays = 8
    const r = actions.harvest("0_0");
    expect(r.ok).toBe(true);
    expect(inventory.count("starberry")).toBe(1); // yield = 1
    expect(tiles.get("0_0")!.crop).toEqual({
      cropId: "starberry", growthDay: 0, harvestedCount: 1,
    });
  });

  it("未知地块 / 无作物 → NOT_MATURE", () => {
    const r1 = actions.harvest("9_9");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("NOT_MATURE");
  });
});

// ────────────────────────────────────────────────
// sell
// ────────────────────────────────────────────────
describe("FarmActions.sell", () => {
  it("成功：库存扣减 + 金币累加（sellPrice × amount）", () => {
    inventory.add("dew_radish", 3);
    const price = getItem("dew_radish")!.sellPrice!;
    const r = actions.sell("dew_radish", 2);
    expect(r.ok).toBe(true);
    expect(inventory.count("dew_radish")).toBe(1);
    expect(economy.getGold()).toBe(price * 2);
  });

  it("库存不足 → NOT_ENOUGH，金币不变", () => {
    inventory.add("dew_radish", 1);
    const r = actions.sell("dew_radish", 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_ENOUGH");
    expect(economy.getGold()).toBe(0);
    expect(inventory.count("dew_radish")).toBe(1);
  });

  it("种子 → NOT_SELLABLE，金币不变、库存不变", () => {
    inventory.add("dew_radish_seed", 5);
    const r = actions.sell("dew_radish_seed", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_SELLABLE");
    expect(economy.getGold()).toBe(0);
    expect(inventory.count("dew_radish_seed")).toBe(5);
  });

  it("工具（无 sellPrice）→ NOT_SELLABLE", () => {
    inventory.add("hoe", 1);
    const r = actions.sell("hoe", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_SELLABLE");
    expect(inventory.count("hoe")).toBe(1);
  });

  it("未知物品 → UNKNOWN_ITEM", () => {
    const r = actions.sell("not_an_item", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNKNOWN_ITEM");
  });

  it("amount ≤ 0 → INVALID_AMOUNT", () => {
    inventory.add("dew_radish", 5);
    const r1 = actions.sell("dew_radish", 0);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("INVALID_AMOUNT");
    const r2 = actions.sell("dew_radish", -1);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("INVALID_AMOUNT");
    expect(economy.getGold()).toBe(0);
    expect(inventory.count("dew_radish")).toBe(5);
  });

  it("原子性：remove 失败时不加金币", () => {
    const r = actions.sell("dew_radish", 1); // 背包里没有
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_ENOUGH");
    expect(economy.getGold()).toBe(0);
  });
});
