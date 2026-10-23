import { ItemCategory, type ItemDefinition } from "../domain/models/Item";

/**
 * 全物品表（30 项）。
 * 组成：2 工具 + 11 种子 + 11 收获作物 + 3 采集材料 + 1 食物 + 2 鱼。
 * 数值与 src/data/crops.ts 冻结表逐条对齐（T3 会做一致性测试）。
 */
export const ITEMS: readonly ItemDefinition[] = [
  // ── 工具 ────────────────────────────────────────
  { id: "hoe",           name: "锄头", category: ItemCategory.Tool, price: 0, stackable: false, maxStack: 1, energyCost: 5 },
  { id: "watering_can",  name: "水壶", category: ItemCategory.Tool, price: 0, stackable: false, maxStack: 1, energyCost: 2 },

  // ── 春 · 种子 ───────────────────────────────────
  { id: "dew_radish_seed",   name: "青露萝卜种子", category: ItemCategory.Seed, price: 10, stackable: true, maxStack: 99 },
  { id: "morning_bean_seed", name: "晨光豆种子",   category: ItemCategory.Seed, price: 18, stackable: true, maxStack: 99 },
  { id: "starberry_seed",    name: "星芽莓种子",   category: ItemCategory.Seed, price: 35, stackable: true, maxStack: 99 },
  // ── 春 · 作物 ───────────────────────────────────
  { id: "dew_radish",   name: "青露萝卜", category: ItemCategory.Crop, price: 0, sellPrice: 24, stackable: true, maxStack: 99 },
  { id: "morning_bean", name: "晨光豆",   category: ItemCategory.Crop, price: 0, sellPrice: 20, stackable: true, maxStack: 99 },
  { id: "starberry",    name: "星芽莓",   category: ItemCategory.Crop, price: 0, sellPrice: 70, stackable: true, maxStack: 99 },

  // ── 夏 · 种子 ───────────────────────────────────
  { id: "ember_tomato_seed", name: "火绒番茄种子", category: ItemCategory.Seed, price: 25, stackable: true, maxStack: 99 },
  { id: "blue_melon_seed",   name: "蓝湾瓜种子",   category: ItemCategory.Seed, price: 40, stackable: true, maxStack: 99 },
  { id: "gold_corn_seed",    name: "金穗玉米种子",  category: ItemCategory.Seed, price: 30, stackable: true, maxStack: 99 },
  // ── 夏 · 作物 ───────────────────────────────────
  { id: "ember_tomato", name: "火绒番茄", category: ItemCategory.Crop, price: 0, sellPrice: 25,  stackable: true, maxStack: 99 },
  { id: "blue_melon",   name: "蓝湾瓜",   category: ItemCategory.Crop, price: 0, sellPrice: 110, stackable: true, maxStack: 99 },
  { id: "gold_corn",    name: "金穗玉米", category: ItemCategory.Crop, price: 0, sellPrice: 55,  stackable: true, maxStack: 99 },

  // ── 秋 · 种子 ───────────────────────────────────
  { id: "amber_pumpkin_seed", name: "琥珀南瓜种子", category: ItemCategory.Seed, price: 45, stackable: true, maxStack: 99 },
  { id: "leaf_cabbage_seed",  name: "丰叶白菜种子", category: ItemCategory.Seed, price: 20, stackable: true, maxStack: 99 },
  { id: "moon_grape_seed",    name: "月纹葡萄种子", category: ItemCategory.Seed, price: 60, stackable: true, maxStack: 99 },
  // ── 秋 · 作物 ───────────────────────────────────
  { id: "amber_pumpkin", name: "琥珀南瓜", category: ItemCategory.Crop, price: 0, sellPrice: 150, stackable: true, maxStack: 99 },
  { id: "leaf_cabbage",  name: "丰叶白菜", category: ItemCategory.Crop, price: 0, sellPrice: 45,  stackable: true, maxStack: 99 },
  { id: "moon_grape",    name: "月纹葡萄", category: ItemCategory.Crop, price: 0, sellPrice: 80,  stackable: true, maxStack: 99 },

  // ── 冬 · 种子 ───────────────────────────────────
  { id: "snow_flower_seed", name: "雪晶花种子",   category: ItemCategory.Seed, price: 30, stackable: true, maxStack: 99 },
  { id: "ice_grass_seed",   name: "冰露草种子",   category: ItemCategory.Seed, price: 25, stackable: true, maxStack: 99 },
  // ── 冬 · 作物 ───────────────────────────────────
  { id: "snow_flower", name: "雪晶花",   category: ItemCategory.Crop, price: 0, sellPrice: 90, stackable: true, maxStack: 99 },
  { id: "ice_grass",   name: "冰露草",   category: ItemCategory.Crop, price: 0, sellPrice: 55, stackable: true, maxStack: 99 },
  // ── 林缘采集与烹饪 ──────────────────────────────
  { id: "branch", name: "树枝", category: ItemCategory.Material, price: 0, sellPrice: 4, stackable: true, maxStack: 99 },
  { id: "stone", name: "溪石", category: ItemCategory.Material, price: 0, sellPrice: 5, stackable: true, maxStack: 99 },
  { id: "wild_mushroom", name: "野蘑菇", category: ItemCategory.Material, price: 0, sellPrice: 14, stackable: true, maxStack: 99 },
  { id: "mushroom_meal", name: "菌菇餐", category: ItemCategory.Special, price: 0, stackable: true, maxStack: 20 },
  // ── 池塘鱼获 ────────────────────────────────────
  { id: "silver_crucian", name: "银鳞鲫", category: ItemCategory.Material, price: 0, sellPrice: 24, stackable: true, maxStack: 99 },
  { id: "sun_carp", name: "日纹鲤", category: ItemCategory.Material, price: 0, sellPrice: 40, stackable: true, maxStack: 99 },
] as const;

export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS.find((i) => i.id === id);
}
