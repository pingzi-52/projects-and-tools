import { describe, it, expect } from "vitest";
import { CropService } from "../src/domain/services/CropService";
import { CROPS } from "../src/data/crops";
import type { CropDefinition, CropState } from "../src/domain/models/Crop";

// 本地定义两个测试用作物（不依赖具体数据表值，便于边界覆盖）
const normalCrop: CropDefinition = {
  id: "radish",
  name: "萝卜",
  seasons: ["spring"],
  seedItemId: "radish_seed",
  seedPrice: 10,
  growDays: 4,
  yield: 1,
  sellPrice: 24,
};

const repeatCrop: CropDefinition = {
  id: "berry",
  name: "星芽莓",
  seasons: ["spring"],
  seedItemId: "berry_seed",
  seedPrice: 35,
  growDays: 6,
  yield: 1,
  sellPrice: 70,
  repeatHarvest: true,
  regrowDays: 3,
};

const svc = new CropService([normalCrop, repeatCrop]);

const cs = (cropId: string, growthDay: number, harvestedCount = 0): CropState => ({
  cropId,
  growthDay,
  harvestedCount,
});

// ────────────────────────────────────────────────
// stageOf：V1.2 四段映射
// ────────────────────────────────────────────────
describe("CropService.stageOf", () => {
  it("growDays=4：0→seed / 1→sprout / 2,3→young / ≥4→mature", () => {
    expect(svc.stageOf(cs("radish", 0), normalCrop)).toBe("seed");
    expect(svc.stageOf(cs("radish", 1), normalCrop)).toBe("sprout");
    expect(svc.stageOf(cs("radish", 2), normalCrop)).toBe("young");
    expect(svc.stageOf(cs("radish", 3), normalCrop)).toBe("young");
    expect(svc.stageOf(cs("radish", 4), normalCrop)).toBe("mature");
    expect(svc.stageOf(cs("radish", 99), normalCrop)).toBe("mature");
  });

  it("growDays=6（n/2=3）：0→seed / 1,2→sprout / 3,4,5→young / ≥6→mature", () => {
    expect(svc.stageOf(cs("berry", 0), repeatCrop)).toBe("seed");
    expect(svc.stageOf(cs("berry", 1), repeatCrop)).toBe("sprout");
    expect(svc.stageOf(cs("berry", 2), repeatCrop)).toBe("sprout");
    expect(svc.stageOf(cs("berry", 3), repeatCrop)).toBe("young");
    expect(svc.stageOf(cs("berry", 5), repeatCrop)).toBe("young");
    expect(svc.stageOf(cs("berry", 6), repeatCrop)).toBe("mature");
  });

  it("省略 def → 通过 cropId 自动查找", () => {
    expect(svc.stageOf(cs("radish", 4))).toBe("mature");
  });

  it("未知 cropId 且未提供 def → throw", () => {
    expect(() => svc.stageOf(cs("banana", 0))).toThrow(/unknown crop/);
  });
});

// ────────────────────────────────────────────────
// isMature
// ────────────────────────────────────────────────
describe("CropService.isMature", () => {
  it("growthDay >= growDays 为成熟", () => {
    expect(svc.isMature(cs("radish", 3), normalCrop)).toBe(false);
    expect(svc.isMature(cs("radish", 4), normalCrop)).toBe(true);
    expect(svc.isMature(cs("radish", 5), normalCrop)).toBe(true);
  });
});

// ────────────────────────────────────────────────
// tick：只负责成长，纯函数
// ────────────────────────────────────────────────
describe("CropService.tick", () => {
  it("未成熟 + watered → growthDay + 1", () => {
    const before = cs("radish", 0);
    const after = svc.tick(before, true, normalCrop);
    expect(after.growthDay).toBe(1);
    expect(before.growthDay).toBe(0); // 入参不变（纯函数）
    expect(after).not.toBe(before);
  });

  it("未成熟 + !watered → 原样返回", () => {
    const after = svc.tick(cs("radish", 2), false, normalCrop);
    expect(after.growthDay).toBe(2);
  });

  it("非重复作物已成熟 → 封顶不再 +1", () => {
    const after = svc.tick(cs("radish", 4), true, normalCrop);
    expect(after.growthDay).toBe(4);
  });

  it("重复作物已成熟 → tick 也不 +1（等 afterHarvest 归零）", () => {
    const after = svc.tick(cs("berry", 6), true, repeatCrop);
    expect(after.growthDay).toBe(6);
  });
});

// ────────────────────────────────────────────────
// afterHarvest
// ────────────────────────────────────────────────
describe("CropService.afterHarvest", () => {
  it("重复作物 → growthDay=0 且 harvestedCount+1", () => {
    const after = svc.afterHarvest(cs("berry", 6, 0), repeatCrop);
    expect(after.growthDay).toBe(0);
    expect(after.harvestedCount).toBe(1);
  });

  it("重复作物多次收获 → harvestedCount 累加", () => {
    const after = svc.afterHarvest(cs("berry", 6, 3), repeatCrop);
    expect(after.growthDay).toBe(0);
    expect(after.harvestedCount).toBe(4);
  });

  it("非重复作物 → 只累加 harvestedCount，growthDay 保留", () => {
    const after = svc.afterHarvest(cs("radish", 4, 0), normalCrop);
    expect(after.harvestedCount).toBe(1);
    expect(after.growthDay).toBe(4);
  });
});

// ────────────────────────────────────────────────
// CROPS 数据表可加载（不做字段一致性校验，那属 T3）
// ────────────────────────────────────────────────
describe("CROPS 数据表（T3 前移，T1 只做健全性检查）", () => {
  it("CROPS 非空且每项字段完整", () => {
    expect(CROPS.length).toBeGreaterThan(0);
    for (const c of CROPS) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(Array.isArray(c.seasons)).toBe(true);
      expect(c.seasons.length).toBeGreaterThan(0);
      expect(c.seedItemId).toBeTruthy();
      expect(c.growDays).toBeGreaterThan(0);
    }
  });
});

// ────────────────────────────────────────────────
// 重复作物 regrowDays 周期（T1 补丁，V1.2 §3.1 注释）
// ────────────────────────────────────────────────
describe("CropService —— 重复作物 regrowDays 周期", () => {
  it("第二周期阈值 = regrowDays（3），非 growDays（6）——边界 2 假 / 3 真", () => {
    // 本地夹具 repeatCrop/berry 的 growDays=6（真 starberry 才是 8）
    // regrowDays=3 → 边界：growthDay=2 未达 / =3 达
    expect(svc.isMature(cs("berry", 2, 1), repeatCrop)).toBe(false);
    expect(svc.isMature(cs("berry", 3, 1), repeatCrop)).toBe(true);
  });

  it("第二周期 stageOf 四段按 regrowDays 计算（n=3, n/2=1.5）", () => {
    expect(svc.stageOf(cs("berry", 0, 1), repeatCrop)).toBe("seed");
    expect(svc.stageOf(cs("berry", 1, 1), repeatCrop)).toBe("sprout");
    expect(svc.stageOf(cs("berry", 2, 1), repeatCrop)).toBe("young");
    expect(svc.stageOf(cs("berry", 3, 1), repeatCrop)).toBe("mature");
  });

  it("第二周期 tick：growthDay=3 已达阈值 → 封顶不再 +1", () => {
    const after = svc.tick(cs("berry", 3, 1), true, repeatCrop);
    expect(after.growthDay).toBe(3);
  });

  it("第二周期 tick：growthDay=2 未达阈值 → 浇水后 +1", () => {
    const after = svc.tick(cs("berry", 2, 1), true, repeatCrop);
    expect(after.growthDay).toBe(3);
  });

  it("第一周期不受 regrowDays 影响（仍按 growDays=6）", () => {
    expect(svc.isMature(cs("berry", 5, 0), repeatCrop)).toBe(false);
    expect(svc.isMature(cs("berry", 6, 0), repeatCrop)).toBe(true);
  });

  it("缺 regrowDays 的重复作物 → 回退 growDays", () => {
    const noRegrow: CropDefinition = {
      id: "no_regrow",
      name: "无再生期莓",
      seasons: ["spring"],
      seedItemId: "no_regrow_seed",
      seedPrice: 10,
      growDays: 6,
      yield: 1,
      sellPrice: 30,
      repeatHarvest: true,
      // regrowDays 缺省
    };
    const svc2 = new CropService([noRegrow]);
    expect(svc2.isMature(cs("no_regrow", 5, 1), noRegrow)).toBe(false);
    expect(svc2.isMature(cs("no_regrow", 6, 1), noRegrow)).toBe(true);
  });
});
