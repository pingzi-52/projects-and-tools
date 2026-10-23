import { describe, expect, it } from "vitest";
import type { Stage } from "../src/domain/models/Crop";
import { getCropVisual, getSoilVisual } from "../src/game/systems/cropVisual";

const springCrops = ["dew_radish", "morning_bean", "starberry"];
const stages: Stage[] = ["seed", "sprout", "young", "mature"];
const available = (...names: string[]) => (texture: string, frame?: string) => names.includes(frame === undefined ? texture : `${texture}/${frame}`);

describe("crop display descriptions", () => {
  it.each(springCrops.flatMap(cropId => stages.map(stage => ({ cropId, stage }))))("uses the matching spring frame for $cropId / $stage", ({ cropId, stage }) => {
    const frame = `${cropId}_${stage}`;
    expect(getCropVisual(cropId, stage, available(`farm-spring-crops-v1/${frame}`))).toEqual({ texture: "farm-spring-crops-v1", frame, width: 32, height: 32, originX: 0.5, originY: 1 });
  });

  it.each(stages)("missing atlas or frame keeps existing %s graphics", stage => {
    const generic = `crop_${stage}`;
    expect(getCropVisual("dew_radish", stage, available(generic))).toEqual({ texture: generic, width: 32, height: 32, originX: 0.5, originY: 1 });
    expect(getCropVisual("dew_radish", stage, available("farm-spring-crops-v1/morning_bean_mature", generic)).texture).toBe(generic);
  });

  it("falls back to existing crop-specific mature texture before generic", () => {
    expect(getCropVisual("starberry", "mature", available("crop_starberry_mature", "crop_mature"))).toEqual({ texture: "crop_starberry_mature", width: 32, height: 32, originX: 0.5, originY: 1 });
    expect(getCropVisual("starberry", "mature", available("crop_mature")).texture).toBe("crop_mature");
  });

  it.each(stages)("non-spring crops retain old %s textures even if an unrelated atlas frame exists", stage => {
    const callback = available(`farm-spring-crops-v1/ember_tomato_${stage}`, "crop_ember_tomato_mature", `crop_${stage}`);
    expect(getCropVisual("ember_tomato", stage, callback).texture).toBe(stage === "mature" ? "crop_ember_tomato_mature" : `crop_${stage}`);
  });
});

describe("soil display descriptions", () => {
  it.each([{ watered: false, frame: "dry" }, { watered: true, frame: "wet" }])("uses soil $frame frame with centered full-tile bounds", ({ watered, frame }) => {
    expect(getSoilVisual(watered, available(`farm-soil-v1/${frame}`))).toEqual({ texture: "farm-soil-v1", frame, width: 32, height: 32, originX: 0.5, originY: 0.5 });
  });

  it("dry soil falls back to the registered tilled tile when its frame is missing", () => {
    expect(getSoilVisual(false, available("farm-soil-v1/wet", "tile_tilled"))).toEqual({ texture: "tile_tilled", width: 32, height: 32, originX: 0.5, originY: 0.5 });
  });

  it("wet soil uses watered placeholder only when that texture actually exists", () => {
    expect(getSoilVisual(true, available("tile_watered", "tile_tilled")).texture).toBe("tile_watered");
    expect(getSoilVisual(true, available("farm-soil-v1/dry", "tile_tilled"))).toEqual({ texture: "tile_tilled", width: 32, height: 32, originX: 0.5, originY: 0.5 });
  });
});
