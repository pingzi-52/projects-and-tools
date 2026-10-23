import { describe, expect, it } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { planFarmDetails } from "../src/game/systems/farmDetails";

describe("local environment detail placement", () => {
  const world = parseFarm01();
  it("creates bounded patches without modifying the map", () => {
    const before = JSON.stringify(world);
    const details = planFarmDetails(world);
    expect(details.length).toBeGreaterThan(25);
    expect(details.length).toBeLessThan(70);
    expect(JSON.stringify(world)).toBe(before);
    expect(new Set(details.map(d => `${d.row}_${d.col}`)).size).toBe(details.length);
  });
  it("never decorates beds, cultivated soil, water or collision tiles", () => {
    for (const d of planFarmDetails(world)) {
      expect(world.tiles[d.row][d.col]).toEqual({ key: "grass", solid: false });
    }
  });
  it("keeps the spawn, bed approach and main corridor clear", () => {
    for (const d of planFarmDetails(world)) {
      expect(Math.abs(d.row - world.start.row) <= 1 && Math.abs(d.col - world.start.col) <= 1).toBe(false);
      expect(Math.abs(d.row - world.bed.row) <= 1 && Math.abs(d.col - world.bed.col) <= 1).toBe(false);
      expect(d.col >= 11 && d.col <= 13 && d.row >= 5 && d.row <= 15).toBe(false);
    }
  });
  it("is stable on re-entry and tolerates a small map", () => {
    expect(planFarmDetails(world)).toEqual(planFarmDetails(parseFarm01()));
    const small = parseFarm01(["FFF", "FBS", "FFF"]);
    expect(planFarmDetails(small)).toEqual([]);
  });
});
