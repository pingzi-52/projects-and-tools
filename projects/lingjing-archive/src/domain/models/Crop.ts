import type { Season } from "./types";

/** 阶段枚举（D3：不落盘，由 growthDay + growDays 实时推导） */
export type Stage = "seed" | "sprout" | "young" | "mature";

export interface CropDefinition {
  id: string;
  name: string;
  /** 适种季节（数组，v1.1 起支持多季作物） */
  seasons: Season[];
  /** 对应种子 item id（= crop id + "_seed"） */
  seedItemId: string;
  /** 种子购买价 */
  seedPrice: number;
  /** 首次成熟所需成长天数 */
  growDays: number;
  /** 单次收获产出数量 */
  yield: number;
  /** 收获物出售单价 */
  sellPrice: number;
  /** 是否重复收获 */
  repeatHarvest?: boolean;
  /** 重复收获后再成熟天数（仅 repeatHarvest 有效） */
  regrowDays?: number;
  /** 体力消耗（D7：第二阶段只记录不扣减） */
  energyCost?: number;
}

export interface CropState {
  cropId: string;
  /** 已累计成长天数 */
  growthDay: number;
  /** 已收获次数（仅 repeatHarvest 作物使用） */
  harvestedCount: number;
}

export interface FarmTileState {
  /** `${row}_${col}`，仅耕地格有状态 */
  id: string;
  /** 恒 true（只有耕地格会进此表），保留字段兼容 GPT 文档 */
  tilled: boolean;
  /** 当日是否浇过水 */
  watered: boolean;
  /** 未播种时无此字段 */
  crop?: CropState;
}
