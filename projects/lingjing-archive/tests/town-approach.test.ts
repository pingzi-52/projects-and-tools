import { describe, expect, it } from "vitest";
import { createTownMap } from "../src/data/maps/explorationMaps";

const FORECOURT = [9, 10].flatMap(row => [7, 10, 21, 24].map(col => ({ row, col })));
const key = (p: { row: number; col: number }) => `${p.row}_${p.col}`;

describe("town entrance forecourts", () => {
  it("adds exactly eight walkable paving cells at the two existing entrances", () => {
    const town = createTownMap(), paths = new Set(town.paths.map(key));
    expect(town.paths).toHaveLength(131);
    expect(paths.size).toBe(131);
    for (const point of FORECOURT) {
      expect(paths.has(key(point)), `paved ${key(point)}`).toBe(true);
      expect(town.tiles[point.row][point.col].solid).toBe(false);
    }
  });

  it("leaves buildings, props, resident and start safe and keeps the well off all paths", () => {
    const town = createTownMap(), paths = new Set(town.paths.map(key));
    expect(town.resident).toEqual({ row: 11, col: 18 });
    expect(town.start).toEqual({ row: 20, col: 15 });
    expect(town.buildings.map(b => [b.row, b.col, b.width, b.height])).toEqual([[6, 6, 6, 3], [6, 20, 6, 3]]);
    for (const prop of town.props) if (prop.blocking) expect(paths.has(key(prop))).toBe(false);
    expect(town.clearings).toEqual([]);
    expect(paths.has("11_10")).toBe(false);
  });

  it("connects every new forecourt to the old street with the player's 32x28 footprint", () => {
    const town = createTownMap(), seen = new Set([key(town.start)]), queue = [town.start];
    const fits = (row: number, col: number) => {
      if (!town.tiles[row]?.[col] || town.tiles[row][col].solid) return false;
      if (row === town.resident.row && col === town.resident.col) return false;
      // Cell-centred 32x28 body fits a non-solid tile; adjacent edges are tangent.
      return row > 0 && row < town.height - 1 && col > 0 && col < town.width - 1;
    };
    for (let i = 0; i < queue.length; i++) for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const next = { row: queue[i].row + dr, col: queue[i].col + dc };
      if (fits(next.row, next.col) && !seen.has(key(next))) { seen.add(key(next)); queue.push(next); }
    }
    for (const point of FORECOURT) expect(seen.has(key(point))).toBe(true);
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      expect(seen.has(`${town.resident.row + dr}_${town.resident.col + dc}`)).toBe(true);
    }
  });
});
