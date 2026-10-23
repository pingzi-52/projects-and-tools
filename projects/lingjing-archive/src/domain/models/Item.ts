export enum ItemCategory {
  Seed = "seed",
  Crop = "crop",
  Material = "material",
  Tool = "tool",
  Special = "special",
}

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  /** 购买价（种子/工具）；收获作物此字段为 0 */
  price: number;
  /** 可出售单价（作物）；未定义 = 不可出售 */
  sellPrice?: number;
  stackable: boolean;
  maxStack: number;
  /** 工具消耗记录字段；第二阶段只记录不扣减 */
  energyCost?: number;
}

export interface InventorySlot {
  itemId: string;
  amount: number;
}

export interface InventoryState {
  /** 长度恒 = capacity */
  capacity: number;
  /** 长度恒 = capacity，空槽为 null */
  slots: (InventorySlot | null)[];
}
