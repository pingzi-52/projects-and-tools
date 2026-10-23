import { describe, expect, it } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { planSoilSurface, soilQuarterFrames } from "../src/game/systems/farmSoilSurface";

describe("connected soil display", () => {
  it("prepared empty fields stay raw and preserve the original two 4x4 footprints", () => {
    const world = parseFarm01(), before = JSON.stringify(world);
    const cells = planSoilSurface(world, {}, true);
    expect(cells).toHaveLength(32);
    expect(cells.every(c => c.state === "raw" && c.row >= 7 && c.row <= 10)).toBe(true);
    expect(cells.filter(c => c.col >= 7 && c.col <= 10)).toHaveLength(16);
    expect(cells.filter(c => c.col >= 13 && c.col <= 16)).toHaveLength(16);
    expect(cells.find(c => c.id === "7_7")?.neighbors).toBe(6);
    expect(cells.find(c => c.id === "8_9")?.neighbors).toBe(15);
    expect(JSON.stringify(world)).toBe(before);
  });
  it("existing dry and watered cells use their state without mutating the saved snapshot", () => {
    const snap = { "7_13": { id: "7_13", tilled: true, watered: false }, "7_14": { id: "7_14", tilled: true, watered: true } };
    const before = JSON.stringify(snap), cells = planSoilSurface(parseFarm01(), snap, true);
    expect(cells.find(c => c.id === "7_13")?.state).toBe("dry");
    expect(cells.find(c => c.id === "7_14")?.state).toBe("wet");
    expect(cells.find(c => c.id === "7_15")?.state).toBe("raw");
    expect(JSON.stringify(snap)).toBe(before);
  });
  it("new cultivated grass joins neighboring prepared earth without inner grass seams", () => {
    const cells = planSoilSurface(parseFarm01(), { "6_13": { id: "6_13", tilled: true, watered: false } }, true);
    expect(cells).toHaveLength(33);
    expect(cells.find(c => c.id === "6_13")?.neighbors).toBe(4);
    expect(cells.find(c => c.id === "7_13")?.neighbors).toBe(7);
  });
  it("isolated cells retain all four outer corners and connected interiors contain none", () => {
    expect(soilQuarterFrames("dry", 0).map(q => q.frame)).toEqual(["dry_0_0_0_0", "dry_2_0_1_0", "dry_0_2_0_1", "dry_2_2_1_1"]);
    expect(soilQuarterFrames("wet", 15).map(q => q.frame)).toEqual(["wet_1_1_0_0", "wet_1_1_1_0", "wet_1_1_0_1", "wet_1_1_1_1"]);
    expect(soilQuarterFrames("raw", 6).map(q => q.frame)).toEqual(["raw_0_0_0_0", "raw_1_0_1_0", "raw_0_1_0_1", "raw_1_1_1_1"]);
  });
  it("every neighbor combination covers exactly one 32x32 cell without crossing it", () => {
    for (let mask = 0; mask < 16; mask++) {
      const quarters = soilQuarterFrames("dry", mask);
      expect(quarters.map(q => [q.x, q.y])).toEqual([[0, 0], [16, 0], [0, 16], [16, 16]]);
      expect(new Set(quarters.map(q => q.frame)).size).toBe(4);
    }
  });
  it("invalid or non-farm snapshot cells and the fallback bed cannot become cultivated soil", () => {
    const snap = { "8_8": { id: "8_8", tilled: true, watered: true }, "0_0": { id: "0_0", tilled: true, watered: true }, "00_02": { id: "00_02", tilled: true, watered: true }, "12_12": { id: "12_12", tilled: false, watered: false } };
    const cells = planSoilSurface(parseFarm01(), snap, false);
    expect(cells).toHaveLength(31);
    expect(cells.some(c => ["8_8", "0_0", "00_02", "12_12"].includes(c.id))).toBe(false);
  });
});
