import type { CropState, FarmTileState } from "../models/Crop";
import type { Result } from "../models/Result";
import type { WeatherState } from "../models/Weather";
import type { CropService } from "./CropService";

/** 失败原因码（V1.2 只允许这 5 个） */
export const FarmingFailReason = {
  NOT_TILLED: "NOT_TILLED",
  ALREADY_HAS_CROP: "ALREADY_HAS_CROP",
  UNKNOWN_CROP: "UNKNOWN_CROP",
  NOT_MATURE: "NOT_MATURE",
  UNKNOWN_TILE: "UNKNOWN_TILE",
} as const;

export interface HarvestResult {
  tileId: string;
  cropId: string;
  amount: number;
  cropAfter: CropState | null;
}

/**
 * 地块状态操作。
 * - 持有 Map<string, FarmTileState>（引用共享，外部序列化/恢复用同一引用）
 * - 成长判定委托 CropService
 * - 所有业务失败返回 Result；不 throw
 */
export class FarmingService {
  constructor(
    private readonly tiles: Map<string, FarmTileState>,
    private readonly crops: CropService,
  ) {}

  /** 开垦：已开垦格 → 幂等 ok（C4/Q5 裁定）；未开垦 → 建 {tilled:true, watered:false} */
  till(tileId: string): Result {
    if (this.tiles.has(tileId)) {
      return { ok: true, value: undefined };
    }
    this.tiles.set(tileId, { id: tileId, tilled: true, watered: false });
    return { ok: true, value: undefined };
  }

  /** 播种：需先开垦、无作物、作物定义存在 */
  plant(tileId: string, cropId: string): Result {
    const tile = this.tiles.get(tileId);
    if (!tile) return { ok: false, reason: FarmingFailReason.NOT_TILLED };
    if (tile.crop) return { ok: false, reason: FarmingFailReason.ALREADY_HAS_CROP };
    if (!this.crops.getDefinition(cropId)) {
      return { ok: false, reason: FarmingFailReason.UNKNOWN_CROP };
    }
    tile.crop = { cropId, growthDay: 0, harvestedCount: 0 };
    return { ok: true, value: undefined };
  }

  /** 浇水：需有 tile；置 watered = true */
  water(tileId: string): Result {
    const tile = this.tiles.get(tileId);
    if (!tile) return { ok: false, reason: FarmingFailReason.NOT_TILLED };
    tile.watered = true;
    return { ok: true, value: undefined };
  }

  /**
   * 收获：
   * - 无 tile → UNKNOWN_TILE
   * - 无作物 / 未成熟 → NOT_MATURE
   * - repeatHarvest → afterHarvest 写回 tile.crop
   * - 一次性 → 删除 tile.crop，cropAfter = null
   */
  harvest(tileId: string): Result<HarvestResult> {
    const tile = this.tiles.get(tileId);
    if (!tile) return { ok: false, reason: FarmingFailReason.UNKNOWN_TILE };

    const crop = tile.crop;
    if (!crop) return { ok: false, reason: FarmingFailReason.NOT_MATURE };

    const def = this.crops.getDefinition(crop.cropId);
    if (!def) return { ok: false, reason: FarmingFailReason.UNKNOWN_CROP };

    if (!this.crops.isMature(crop, def)) {
      return { ok: false, reason: FarmingFailReason.NOT_MATURE };
    }

    const amount = def.yield;

    if (def.repeatHarvest) {
      const after = this.crops.afterHarvest(crop, def);
      tile.crop = after;
      return {
        ok: true,
        value: { tileId, cropId: def.id, amount, cropAfter: after },
      };
    }

    // 一次性作物：清除 crop
    delete tile.crop;
    return {
      ok: true,
      value: { tileId, cropId: def.id, amount, cropAfter: null },
    };
  }

  /**
   * 每日推进（由 GameSession.sleep 调用，D1/D2）。
   * 逐格：weather.autoWater 视为已浇水 → crops.tick → 重置 watered。
   * day 参数当前未使用（保留给 Phase 3：季节/任务/商店刷新用）。
   */
  tickDay(_day: number, weather: WeatherState): void {
    for (const tile of this.tiles.values()) {
      if (tile.crop) {
        const watered = tile.watered || weather.autoWater;
        tile.crop = this.crops.tick(tile.crop, watered);
      }
      tile.watered = false;
    }
  }

  /** 快照（深拷贝作物字段，防止外部误改内部状态） */
  serialize(): Record<string, FarmTileState> {
    const out: Record<string, FarmTileState> = {};
    for (const [id, tile] of this.tiles) {
      const entry: FarmTileState = {
        id: tile.id,
        tilled: tile.tilled,
        watered: tile.watered,
      };
      if (tile.crop) {
        entry.crop = {
          cropId: tile.crop.cropId,
          growthDay: tile.crop.growthDay,
          harvestedCount: tile.crop.harvestedCount,
        };
      }
      out[id] = entry;
    }
    return out;
  }

  /** 恢复：清空当前 Map 后重建 */
  restore(data: Record<string, FarmTileState>): void {
    this.tiles.clear();
    for (const [id, tile] of Object.entries(data)) {
      const entry: FarmTileState = {
        id: tile.id,
        tilled: tile.tilled,
        watered: tile.watered,
      };
      if (tile.crop) {
        entry.crop = {
          cropId: tile.crop.cropId,
          growthDay: tile.crop.growthDay,
          harvestedCount: tile.crop.harvestedCount,
        };
      }
      this.tiles.set(id, entry);
    }
  }
}
