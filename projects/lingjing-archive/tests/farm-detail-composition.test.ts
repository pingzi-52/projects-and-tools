import { describe, expect, it } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { planFarmDetails } from "../src/game/systems/farmDetails";

describe("farm planting composition", () => {
  it("keeps the full width of the two-tile east-west walking route clear", () => {
    expect(planFarmDetails(parseFarm01()).filter(p => p.row === 13 || p.row === 14)).toEqual([]);
  });
  it("respects all scenery reservations without mutating their list", () => {
    const world = parseFarm01();
    const reserved = planFarmDetails(world).slice(0, 6).map(p => `${p.row}_${p.col}`);
    const before = [...reserved];
    const result = planFarmDetails(world, reserved);
    expect(result.every(p => !reserved.includes(`${p.row}_${p.col}`))).toBe(true);
    expect(reserved).toEqual(before);
  });
  it("rejects solid grass as well as non-grass surfaces", () => {
    const world = parseFarm01();
    for (const p of planFarmDetails(world)) world.tiles[p.row][p.col].solid = true;
    expect(planFarmDetails(world)).toEqual([]);
  });
  it("uses denser flower hearts, sparse edges and a few small pond-side plants", () => {
    const result = planFarmDetails(parseFarm01());
    expect(result.some(p => p.kind === "flowers" && p.density === 3)).toBe(true);
    expect(result.some(p => p.kind === "flowers" && p.density === 1)).toBe(true);
    expect(result.filter(p => p.kind === "shrub").length).toBeGreaterThan(0);
    expect(result.filter(p => p.kind === "shrub").length).toBeLessThanOrEqual(2);
    expect(result.filter(p => p.kind === "shrub").every(p => p.col >= 24 && p.row >= 15)).toBe(true);
  });
});
