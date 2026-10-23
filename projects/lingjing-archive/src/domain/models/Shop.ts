import type { Season } from "./types";

export interface ShopItem {
  itemId: string;
  price: number;
  /** 未定义 = 全年可售（工具类） */
  season?: Season;
  /** 第二阶段恒为 99999，字段保留 */
  stock: number;
}
