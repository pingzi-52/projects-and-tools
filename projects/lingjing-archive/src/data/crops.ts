import type { CropDefinition } from "../domain/models/Crop";

/** 全作物表（11 种，与 §2.1 冻结表逐字一致） */
export const CROPS: readonly CropDefinition[] = [
  // ── 春 ─────────────────────────────────────────
  { id: "dew_radish",    name: "青露萝卜", seasons: ["spring"], seedItemId: "dew_radish_seed",    seedPrice: 10, growDays: 4,  yield: 1, sellPrice: 24  },
  { id: "morning_bean",  name: "晨光豆",   seasons: ["spring"], seedItemId: "morning_bean_seed",  seedPrice: 18, growDays: 6,  yield: 2, sellPrice: 20  },
  { id: "starberry",     name: "星芽莓",   seasons: ["spring"], seedItemId: "starberry_seed",     seedPrice: 35, growDays: 8,  yield: 1, sellPrice: 70, repeatHarvest: true, regrowDays: 3 },
  // ── 夏 ─────────────────────────────────────────
  { id: "ember_tomato",  name: "火绒番茄", seasons: ["summer"], seedItemId: "ember_tomato_seed",  seedPrice: 25, growDays: 8,  yield: 3, sellPrice: 25  },
  { id: "blue_melon",    name: "蓝湾瓜",   seasons: ["summer"], seedItemId: "blue_melon_seed",    seedPrice: 40, growDays: 10, yield: 1, sellPrice: 110 },
  { id: "gold_corn",     name: "金穗玉米",  seasons: ["summer"], seedItemId: "gold_corn_seed",     seedPrice: 30, growDays: 12, yield: 2, sellPrice: 55  },
  // ── 秋 ─────────────────────────────────────────
  { id: "amber_pumpkin", name: "琥珀南瓜", seasons: ["autumn"], seedItemId: "amber_pumpkin_seed", seedPrice: 45, growDays: 13, yield: 1, sellPrice: 150 },
  { id: "leaf_cabbage",  name: "丰叶白菜", seasons: ["autumn"], seedItemId: "leaf_cabbage_seed",  seedPrice: 20, growDays: 6,  yield: 2, sellPrice: 45  },
  { id: "moon_grape",    name: "月纹葡萄", seasons: ["autumn"], seedItemId: "moon_grape_seed",    seedPrice: 60, growDays: 10, yield: 2, sellPrice: 80  },
  // ── 冬 ─────────────────────────────────────────
  { id: "snow_flower",   name: "雪晶花",   seasons: ["winter"], seedItemId: "snow_flower_seed",   seedPrice: 30, growDays: 8,  yield: 1, sellPrice: 90  },
  { id: "ice_grass",     name: "冰露草",   seasons: ["winter"], seedItemId: "ice_grass_seed",     seedPrice: 25, growDays: 7,  yield: 2, sellPrice: 55  },
] as const;

export function getCrop(id: string): CropDefinition | undefined {
  return CROPS.find((c) => c.id === id);
}

export function getCropBySeed(seedItemId: string): CropDefinition | undefined {
  return CROPS.find((c) => c.seedItemId === seedItemId);
}
