import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detailSprites } from "../src/game/systems/detailSprites";
import { planFarmDetails } from "../src/game/systems/farmDetails";
import { planForestDetails } from "../src/game/systems/forestDetails";
import { parseFarm01 } from "../src/data/maps/farm01";
import { createForestMap } from "../src/data/maps/explorationMaps";

describe("bounded low-density plant sprites", () => {
  it.each([1, 2, 3])("uses exactly %s flowers, with no hidden filler grass", density => {
    const sprites = detailSprites({ row: 6, col: 5, kind: "flowers", density });
    expect(sprites).toHaveLength(density);
    expect(sprites.every(p => p.frame === "TX Plant - Flower 01")).toBe(true);
  });
  it("uses a single small shrub and at most two grass sprites per tile", () => {
    expect(detailSprites({ row: 4, col: 21, kind: "shrub" })).toHaveLength(1);
    expect(detailSprites({ row: 4, col: 21, kind: "tufts", density: 1 })).toHaveLength(1);
    expect(detailSprites({ row: 4, col: 21, kind: "tufts", density: 2 })).toHaveLength(2);
  });
  it("keeps every planned plant entirely within its own 32x32 tile using the actual atlas", () => {
    const atlas = JSON.parse(readFileSync(new URL("../public/farm-assets/cainos-basic/TX Plant.json", import.meta.url), "utf8"));
    const details = [...planFarmDetails(parseFarm01()), ...planForestDetails(createForestMap())];
    expect(details.length).toBeGreaterThan(30);
    for (const detail of details) {
      const sprites = detailSprites(detail);
      expect(sprites.length).toBeGreaterThan(0);
      for (const sprite of sprites) {
        const frame = atlas.frames[sprite.frame]?.frame;
        expect(frame, sprite.frame).toBeDefined();
        expect(sprite.x - frame.w / 2).toBeGreaterThanOrEqual(0);
        expect(sprite.x + frame.w / 2).toBeLessThanOrEqual(32);
        expect(sprite.y - frame.h).toBeGreaterThanOrEqual(0);
        expect(sprite.y).toBeLessThanOrEqual(32);
      }
    }
  });
  it("returns deterministic fresh sprite data without mutating the detail", () => {
    const detail = { row: 9, col: 12, kind: "flowers", density: 3 };
    const before = { ...detail }, first = detailSprites(detail), second = detailSprites(detail);
    expect(first).toEqual(second); expect(detail).toEqual(before);
    first[0].x = -1; expect(first).not.toEqual(second);
  });
});
