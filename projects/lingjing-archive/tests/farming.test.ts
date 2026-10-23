import { describe, it, expect, beforeEach } from "vitest";
import { CropService } from "../src/domain/services/CropService";
import { FarmingService } from "../src/domain/services/FarmingService";
import type { CropDefinition, FarmTileState } from "../src/domain/models/Crop";
import type { WeatherState } from "../src/domain/models/Weather";

const radish: CropDefinition = {
  id: "radish", name: "萝卜", seasons: ["spring"],
  seedItemId: "radish_seed", seedPrice: 10,
  growDays: 4, yield: 2, sellPrice: 24,
};

const berry: CropDefinition = {
  id: "berry", name: "星芽莓", seasons: ["spring"],
  seedItemId: "berry_seed", seedPrice: 35,
  growDays: 6, yield: 1, sellPrice: 70,
  repeatHarvest: true, regrowDays: 3,
};

const SUNNY: WeatherState = { type: "sunny", autoWater: false };
const RAIN: WeatherState = { type: "rain", autoWater: true };

let tiles: Map<string, FarmTileState>;
let svc: FarmingService;

beforeEach(() => {
  tiles = new Map();
  svc = new FarmingService(tiles, new CropService([radish, berry]));
});

// ────────────────────────────────────────────────
// till
// ────────────────────────────────────────────────
describe("FarmingService.till", () => {
  it("开垦成功，写入 tilled=true / watered=false", () => {
    const r = svc.till("0_0");
    expect(r.ok).toBe(true);
    expect(tiles.get("0_0")).toEqual({
      id: "0_0", tilled: true, watered: false,
    });
  });

  it("已开垦 → 幂等 ok，且不清除 watered 状态（C4/Q5 裁定）", () => {
    svc.till("0_0");
    svc.water("0_0");
    const r = svc.till("0_0");
    expect(r.ok).toBe(true);
    expect(tiles.get("0_0")!.watered).toBe(true);
  });
});

// ────────────────────────────────────────────────
// plant
// ────────────────────────────────────────────────
describe("FarmingService.plant", () => {
  it("播种成功", () => {
    svc.till("0_0");
    const r = svc.plant("0_0", "radish");
    expect(r.ok).toBe(true);
    expect(tiles.get("0_0")!.crop).toEqual({
      cropId: "radish", growthDay: 0, harvestedCount: 0,
    });
  });

  it("未开垦 → NOT_TILLED", () => {
    const r = svc.plant("0_0", "radish");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_TILLED");
  });

  it("未知作物 → UNKNOWN_CROP", () => {
    svc.till("0_0");
    const r = svc.plant("0_0", "banana");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNKNOWN_CROP");
  });

  it("已有作物 → ALREADY_HAS_CROP", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    const r = svc.plant("0_0", "radish");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ALREADY_HAS_CROP");
  });
});

// ────────────────────────────────────────────────
// water
// ────────────────────────────────────────────────
describe("FarmingService.water", () => {
  it("浇水成功 → watered=true", () => {
    svc.till("0_0");
    const r = svc.water("0_0");
    expect(r.ok).toBe(true);
    expect(tiles.get("0_0")!.watered).toBe(true);
  });

  it("未开垦 → NOT_TILLED", () => {
    const r = svc.water("0_0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_TILLED");
  });
});

// ────────────────────────────────────────────────
// harvest
// ────────────────────────────────────────────────
describe("FarmingService.harvest", () => {
  it("未知地块 → UNKNOWN_TILE", () => {
    const r = svc.harvest("0_0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNKNOWN_TILE");
  });

  it("无作物 → NOT_MATURE", () => {
    svc.till("0_0");
    const r = svc.harvest("0_0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_MATURE");
  });

  it("未成熟 → NOT_MATURE", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    tiles.get("0_0")!.crop!.growthDay = 3;
    const r = svc.harvest("0_0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_MATURE");
  });

  it("一次性作物成熟收获 → cropAfter=null 且 tile.crop 被清除", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    tiles.get("0_0")!.crop!.growthDay = 4;

    const r = svc.harvest("0_0");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        tileId: "0_0",
        cropId: "radish",
        amount: 2,       // radish.yield = 2
        cropAfter: null,
      });
    }
    expect(tiles.get("0_0")!.crop).toBeUndefined();
    expect(tiles.get("0_0")!.tilled).toBe(true); // tile 保留
  });

  it("重复作物成熟收获 → cropAfter 归零并累加 harvestedCount（V1.2 tileId 契约）", () => {
    svc.till("0_0");
    svc.plant("0_0", "berry");
    tiles.get("0_0")!.crop!.growthDay = 6;

    const r = svc.harvest("0_0");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tileId).toBe("0_0");     // ← V1.2 契约点
      expect(r.value.cropId).toBe("berry");
      expect(r.value.amount).toBe(1);
      expect(r.value.cropAfter).toEqual({
        cropId: "berry", growthDay: 0, harvestedCount: 1,
      });
    }
    expect(tiles.get("0_0")!.crop).toEqual({
      cropId: "berry", growthDay: 0, harvestedCount: 1,
    });
  });

  it("重复作物收获后进入 regrowDays 周期（端到端，3 天第二次成熟）", () => {
    svc.till("0_0");
    svc.plant("0_0", "berry");
    tiles.get("0_0")!.crop!.growthDay = 6; // berry.growDays = 6，首次成熟

    // 首次收获 → { growthDay: 0, harvestedCount: 1 }
    const r1 = svc.harvest("0_0");
    expect(r1.ok).toBe(true);
    expect(tiles.get("0_0")!.crop).toEqual({
      cropId: "berry", growthDay: 0, harvestedCount: 1,
    });

    // 注意：tickDay 的 day 参数当前仅为标签，不驱动生长逻辑；
    //       推进只由 watered + weather.autoWater 决定。
    // 只浇 2 天水 → 未达 regrowDays=3
    svc.water("0_0"); svc.tickDay(2, SUNNY);
    svc.water("0_0"); svc.tickDay(3, SUNNY);
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(2);
    expect(svc.harvest("0_0").ok).toBe(false); // 未成熟

    // 第 3 天水 → 达阈值
    svc.water("0_0"); svc.tickDay(4, SUNNY);
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(3);
    const r2 = svc.harvest("0_0");
    expect(r2.ok).toBe(true);
    expect(tiles.get("0_0")!.crop).toEqual({
      cropId: "berry", growthDay: 0, harvestedCount: 2,
    });
  });
});

// ────────────────────────────────────────────────
// tickDay
// ────────────────────────────────────────────────
describe("FarmingService.tickDay", () => {
  it("浇水后 tick：growthDay+1 并重置 watered", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    svc.water("0_0");
    svc.tickDay(2, SUNNY);
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(1);
    expect(tiles.get("0_0")!.watered).toBe(false);
  });

  it("未浇水 → growthDay 不动，watered 仍重置为 false", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    svc.tickDay(2, SUNNY);
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(0);
    expect(tiles.get("0_0")!.watered).toBe(false);
  });

  it("雨天 autoWater → 视为已浇水", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    svc.tickDay(2, RAIN);
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(1);
  });

  it("成熟后 tickDay 不再增长", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    tiles.get("0_0")!.crop!.growthDay = 4;
    svc.water("0_0");
    svc.tickDay(3, SUNNY);
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(4);
  });

  it("多个地块同时推进", () => {
    svc.till("0_0"); svc.plant("0_0", "radish"); svc.water("0_0");
    svc.till("1_1"); svc.plant("1_1", "berry");  svc.water("1_1");
    svc.tickDay(2, SUNNY);
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(1);
    expect(tiles.get("1_1")!.crop!.growthDay).toBe(1);
  });
});

// ────────────────────────────────────────────────
// serialize / restore
// ────────────────────────────────────────────────
describe("FarmingService.serialize / restore", () => {
  it("往返一致", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    svc.water("0_0");
    svc.till("1_1");
    svc.plant("1_1", "berry");
    tiles.get("1_1")!.crop!.growthDay = 6;
    tiles.get("1_1")!.crop!.harvestedCount = 2;

    const snap = svc.serialize();

    const tiles2 = new Map<string, FarmTileState>();
    const svc2 = new FarmingService(tiles2, new CropService([radish, berry]));
    svc2.restore(snap);

    expect(svc2.serialize()).toEqual(snap);
  });

  it("restore 会先清空当前状态", () => {
    svc.till("0_0");
    svc.restore({});
    expect(tiles.size).toBe(0);
  });

  it("serialize 返回深拷贝（外部改动不影响内部）", () => {
    svc.till("0_0");
    svc.plant("0_0", "radish");
    const snap = svc.serialize();
    snap["0_0"].crop!.growthDay = 99;
    expect(tiles.get("0_0")!.crop!.growthDay).toBe(0);
  });

  it("未播种地块 crop 字段不出现在快照", () => {
    svc.till("0_0");
    const snap = svc.serialize();
    expect("crop" in snap["0_0"]).toBe(false);
  });
});
