import { describe, expect, it } from "vitest";
import { createForestMap, createTownMap } from "../src/data/maps/explorationMaps";
import { openAreaExits } from "../src/data/maps/areaConnections";
import { applyForestComposition } from "../src/data/maps/forestComposition";

const PATCHES = [
  [[8, 9], [8, 10], [8, 11], [9, 8], [9, 9], [9, 10], [9, 11], [9, 12], [10, 9], [10, 10], [10, 11], [10, 12]],
  [[14, 17], [14, 18], [14, 19], [15, 17], [15, 18], [15, 19], [15, 20], [15, 21], [16, 18], [16, 19], [16, 20]],
  [[3, 22], [3, 23], [3, 24], [4, 21], [4, 22], [4, 23], [4, 24], [4, 25], [5, 21], [5, 22], [5, 23], [5, 24]],
];

describe("three local woodland glades", () => {
  it("opens the exact irregular footprints without deleting rocks or props", () => {
    const map = createForestMap();
    for (const patch of PATCHES) for (const [row, col] of patch) {
      expect(map.tiles[row][col], `${row}_${col}`).toEqual({ key: "grass", solid: false });
      expect(map.clearings).toContainEqual({ row, col });
    }
    expect(map.tiles[16][17]).toEqual({ key: "rock", solid: true });
    for (const prop of map.props) expect(map.tiles[prop.row][prop.col].solid).toBe(prop.blocking);
    expect(map.tiles.flat().filter(tile => tile.key === "tree")).toHaveLength(443);
    expect(openAreaExits(map, "forest").tiles.flat().filter(tile => tile.key === "tree")).toHaveLength(430);
  });

  it("leaves every tile in the outer two-cell belt unchanged", () => {
    const map = createForestMap();
    for (let row = 0; row < map.height; row++) for (let col = 0; col < map.width; col++) {
      if (row < 2 || row >= map.height - 2 || col < 2 || col >= map.width - 2) {
        const oldSpawnTail = row === 22 && (col === 15 || col === 16);
        expect(map.tiles[row][col]).toEqual(oldSpawnTail ? { key: "grass", solid: false } : { key: "tree", solid: true });
      }
    }
  });

  it("makes the three clearings reachable from the original loop and spawn", () => {
    const map = createForestMap(), seen = new Set([`${map.start.row}_${map.start.col}`]), queue = [map.start];
    for (let i = 0; i < queue.length; i++) for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const row = queue[i].row + dr, col = queue[i].col + dc, id = `${row}_${col}`;
      if (!map.tiles[row]?.[col] || map.tiles[row][col].solid || seen.has(id) || row === map.resident.row && col === map.resident.col) continue;
      seen.add(id); queue.push({ row, col });
    }
    for (const patch of PATCHES) for (const [row, col] of patch) expect(seen.has(`${row}_${col}`)).toBe(true);
  });

  it("is idempotent and ignores town layouts", () => {
    const forest = createForestMap(), before = structuredClone(forest);
    applyForestComposition(forest); expect(forest).toEqual(before);
    const town = createTownMap(), townBefore = structuredClone(town);
    applyForestComposition(town); expect(town).toEqual(townBefore);
    expect(new Set(forest.clearings.map(p => `${p.row}_${p.col}`)).size).toBe(forest.clearings.length);
  });
});
