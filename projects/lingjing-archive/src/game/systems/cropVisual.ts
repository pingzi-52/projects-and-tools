import type { Stage } from "../../domain/models/Crop";

export interface FarmVisual {
  texture: string;
  frame?: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export type HasVisualFrame = (texture: string, frame?: string) => boolean;

const SPRING_CROPS = new Set(["dew_radish", "morning_bean", "starberry"]);
const CROP_ATLAS = "farm-spring-crops-v1";
const SOIL_ATLAS = "farm-soil-v1";

/** Pure display selection. A caller checks texture/frame availability without loading Phaser here. */
export function getCropVisual(cropId: string, stage: Stage, hasFrame: HasVisualFrame): FarmVisual {
  const frame = `${cropId}_${stage}`;
  if (SPRING_CROPS.has(cropId) && hasFrame(CROP_ATLAS, frame)) {
    return { texture: CROP_ATLAS, frame, width: 32, height: 32, originX: 0.5, originY: 1 };
  }
  const specific = `crop_${cropId}_mature`;
  if (stage === "mature" && hasFrame(specific)) {
    return { texture: specific, width: 32, height: 32, originX: 0.5, originY: 1 };
  }
  return { texture: `crop_${stage}`, width: 32, height: 32, originX: 0.5, originY: 1 };
}

export function getSoilVisual(watered: boolean, hasFrame: HasVisualFrame): FarmVisual {
  const frame = watered ? "wet" : "dry";
  if (hasFrame(SOIL_ATLAS, frame)) {
    return { texture: SOIL_ATLAS, frame, width: 32, height: 32, originX: 0.5, originY: 0.5 };
  }
  // Current placeholders register tile_tilled only; an absent tile_watered must never be selected.
  const texture = watered && hasFrame("tile_watered") ? "tile_watered" : "tile_tilled";
  return { texture, width: 32, height: 32, originX: 0.5, originY: 0.5 };
}
