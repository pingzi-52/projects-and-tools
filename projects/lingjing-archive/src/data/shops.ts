import type { ShopItem } from "../domain/models/Shop";
import { ItemCategory } from "../domain/models/Item";
import { CROPS } from "./crops";
import { ITEMS } from "./items";

/**
 * 禾木杂货铺（V1.2 §2.3）。
 * 组成：11 种子（按作物 seasons[0] 上架）+ 2 工具（无 season = 全年可售）。
 * 价格与 ITEMS/CROPS 冻结表逐条对齐；stock 恒 99999（Phase 2 不消耗）。
 */
const seedEntries: ShopItem[] = CROPS.map((c) => ({
  itemId: c.seedItemId,
  price: c.seedPrice,
  season: c.seasons[0],
  stock: 99999,
}));

const toolEntries: ShopItem[] = ITEMS
  .filter((i) => i.category === ItemCategory.Tool)
  .map((i) => ({
    itemId: i.id,
    price: i.price,
    stock: 99999,
  }));

export const SHOP_HOMU: {
  npcName: string;
  items: readonly ShopItem[];
} = {
  npcName: "禾木杂货铺",
  items: [...seedEntries, ...toolEntries],
};
