import type { CropDefinition, CropState, Stage } from "../models/Crop";
import { CROPS } from "../../data/crops";

/**
 * 纯作物规则（无状态）。
 * - stageOf / isMature / tick / afterHarvest 均为纯函数，不改入参
 * - 未知 cropId 属编程错误 → throw Error（不走 Result）
 */
export class CropService {
  constructor(private readonly crops: readonly CropDefinition[] = CROPS) {}

  getDefinition(cropId: string): CropDefinition | undefined {
    return this.crops.find((c) => c.id === cropId);
  }

  private resolveDef(crop: CropState, def?: CropDefinition): CropDefinition {
    const d = def ?? this.getDefinition(crop.cropId);
    if (!d) {
      throw new Error(`CropService: unknown crop "${crop.cropId}"`);
    }
    return d;
  }

  /**
   * 当前周期的成熟阈值（私有，纯函数）。
   * - 第一次周期（harvestedCount === 0）：growDays
   * - 重复作物再生长周期（repeatHarvest && harvestedCount > 0）：regrowDays ?? growDays
   * - 非重复作物：恒 growDays
   *   （非重复作物收获后 crop 会被 FarmingService 从 tile 移除，不会进第二周期）
   */
  private thresholdOf(crop: CropState, def: CropDefinition): number {
    if (def.repeatHarvest && crop.harvestedCount > 0) {
      return def.regrowDays ?? def.growDays;
    }
    return def.growDays;
  }

  /**
   * 由 growthDay + 成熟阈值推导当前阶段（V1.2 四段映射，n = 当前周期阈值）：
   *   growthDay < 1        → seed
   *   1 <= growthDay < n/2 → sprout
   *   n/2 <= growthDay < n → young
   *   growthDay >= n       → mature
   * 例：growDays=4 → 0:seed，1:sprout，2~3:young，4+:mature
   */
  stageOf(crop: CropState, def?: CropDefinition): Stage {
    const d = this.resolveDef(crop, def);
    const n = this.thresholdOf(crop, d);
    const g = crop.growthDay;
    if (g < 1) return "seed";
    if (g < n / 2) return "sprout";
    if (g < n) return "young";
    return "mature";
  }

  isMature(crop: CropState, def?: CropDefinition): boolean {
    const d = this.resolveDef(crop, def);
    return crop.growthDay >= this.thresholdOf(crop, d);
  }

  /**
   * 单日成长判定（纯函数，不改入参）：
   * - 已成熟 → 原样返回（非重复作物封顶；重复作物由 afterHarvest 归零）
   * - 未成熟 + watered → growthDay + 1
   * - 未成熟 + !watered → 原样返回
   */
  tick(crop: CropState, watered: boolean, def?: CropDefinition): CropState {
    const d = this.resolveDef(crop, def);
    if (crop.growthDay >= this.thresholdOf(crop, d)) return crop;
    if (!watered) return crop;
    return { ...crop, growthDay: crop.growthDay + 1 };
  }

  /**
   * 收获一次后的状态转移：
   * - repeatHarvest → growthDay 归零，harvestedCount + 1
   * - 非 repeatHarvest → growthDay 保留，harvestedCount + 1
   */
  afterHarvest(crop: CropState, def?: CropDefinition): CropState {
    const d = this.resolveDef(crop, def);
    const nextHarvested = crop.harvestedCount + 1;
    if (d.repeatHarvest) {
      return { ...crop, growthDay: 0, harvestedCount: nextHarvested };
    }
    return { ...crop, harvestedCount: nextHarvested };
  }
}
