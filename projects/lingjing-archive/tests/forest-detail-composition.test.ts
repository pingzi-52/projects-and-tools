import { describe, expect, it } from "vitest";
import { createForestMap, createTownMap } from "../src/data/maps/explorationMaps";
import { planForestDetails } from "../src/game/systems/forestDetails";

const id = (p: { row: number; col: number }) => `${p.row}_${p.col}`;
const flowerGlade = new Set(["8_9", "8_10", "8_11", "9_8", "9_9", "9_10", "9_11", "9_12", "10_9", "10_10", "10_11", "10_12"]);
const stoneGlade = new Set(["14_17", "14_18", "14_19", "15_17", "15_18", "15_19", "15_20", "15_21", "16_18", "16_19", "16_20"]);
const mushroomGlade = new Set(["3_22", "3_23", "3_24", "4_21", "4_22", "4_23", "4_24", "4_25", "5_21", "5_22", "5_23", "5_24"]);

describe("forest planted glades", () => {
  it("gives the wildflower, stone and mushroom clearings different plant groupings", () => {
    const plants = planForestDetails(createForestMap());
    const flowers = plants.filter(p => flowerGlade.has(id(p)));
    expect(flowers.filter(p => p.kind === "flowers").length).toBeGreaterThanOrEqual(3);
    expect(flowers.some(p => p.row === 9 && p.col === 10)).toBe(false);
    expect(flowers.some(p => p.row === 9 && p.col === 11)).toBe(false);
    const stone = plants.filter(p => stoneGlade.has(id(p)));
    expect(stone.length).toBeGreaterThan(0);
    expect(stone.every(p => p.kind !== "flowers")).toBe(true);
    const mushroom = plants.filter(p => mushroomGlade.has(id(p)));
    expect(mushroom.length).toBeGreaterThan(0);
    expect(mushroom.every(p => p.kind === "tufts" || p.kind === "shrub")).toBe(true);
  });
  it("never covers terrain blockers, paths or the quiet radius of interactions", () => {
    const world = createForestMap();
    const paths = new Set(world.paths.map(id));
    const protectedPoints = [world.start, world.resident, ...world.nodes, ...world.props];
    const plants = planForestDetails(world);
    expect(plants.length).toBeGreaterThan(10);
    expect(plants.length).toBeLessThan(85);
    for (const p of plants) {
      expect(world.tiles[p.row][p.col]).toEqual({ key: "grass", solid: false });
      expect(paths.has(id(p))).toBe(false);
      expect(protectedPoints.some(q => Math.abs(q.row - p.row) <= 1 && Math.abs(q.col - p.col) <= 1)).toBe(false);
    }
  });
  it("keeps the newly cleared centers open and reserves old resource clearings", () => {
    const world = createForestMap();
    const knownGlades = new Set([...flowerGlade, ...stoneGlade, ...mushroomGlade]);
    const oldQuietCells = new Set(world.clearings.map(id).filter(cell => !knownGlades.has(cell)));
    const plants = planForestDetails(world);
    expect(plants.every(p => !oldQuietCells.has(id(p)))).toBe(true);
    expect(plants.some(p => p.row === 15 && p.col === 19)).toBe(false);
  });
  it("is deterministic, unique and leaves world data unchanged", () => {
    const world = createForestMap();
    const before = JSON.stringify(world);
    const first = planForestDetails(world);
    expect(first).toEqual(planForestDetails(world));
    expect(new Set(first.map(id)).size).toBe(first.length);
    expect(JSON.stringify(world)).toBe(before);
  });
  it("leaves the town and a fully blocked forest undecorated", () => {
    expect(planForestDetails(createTownMap())).toEqual([]);
    const world = createForestMap();
    for (const row of world.tiles) for (const tile of row) tile.solid = true;
    expect(planForestDetails(world)).toEqual([]);
  });
});
