import { describe, expect, it } from "vitest";
import { areaExits, arrivalFrom, exitAt, openAreaExits, type AreaId } from "../src/data/maps/areaConnections";
import { createForestMap, createTownMap } from "../src/data/maps/explorationMaps";
import { parseFarm01 } from "../src/data/maps/farm01";
import type { ParsedMap } from "../src/data/maps/farm01.types";

const creators = { farm: parseFarm01, forest: createForestMap, town: createTownMap };
const areas: AreaId[] = ["farm", "forest", "town"];
const id = (row: number, col: number) => `${row}_${col}`;

function reachable(world: ParsedMap, blocked?: { row: number; col: number }): Set<string> {
  const queue = [world.start], seen = new Set([id(world.start.row, world.start.col)]);
  for (let i = 0; i < queue.length; i++) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const row = queue[i].row + dr, col = queue[i].col + dc;
    if (!world.tiles[row]?.[col] || world.tiles[row][col].solid || seen.has(id(row, col))) continue;
    if (blocked?.row === row && blocked.col === col) continue;
    queue.push({ row, col }); seen.add(id(row, col));
  }
  return seen;
}

describe("walking area connections", () => {
  it("connects forest, farm and town symmetrically without a forest-town shortcut", () => {
    expect(areaExits("farm").map(exit => exit.destination)).toEqual(["forest", "town"]);
    expect(areaExits("forest").map(exit => exit.destination)).toEqual(["farm"]);
    expect(areaExits("town").map(exit => exit.destination)).toEqual(["farm"]);
    const exits = areas.flatMap(area => [...areaExits(area)]);
    expect(new Set(exits.map(exit => exit.id)).size).toBe(4);
    for (const exit of exits) {
      expect(areaExits(exit.destination).some(back => back.destination === exit.area && back.edge !== exit.edge)).toBe(true);
    }
  });

  it("places arrivals inside the corresponding passage, never inside its trigger", () => {
    expect(arrivalFrom("farm", "forest", 36)).toEqual({ x: 80, y: 448 });
    expect(arrivalFrom("farm", "town", 36)).toEqual({ x: 1072, y: 448 });
    expect(arrivalFrom("forest", "farm", 32)).toEqual({ x: 944, y: 576 });
    expect(arrivalFrom("town", "farm", 32)).toEqual({ x: 80, y: 448 });
    for (const area of areas) for (const from of areas) {
      const arrival = arrivalFrom(area, from, creators[area]().width);
      expect(Boolean(arrival)).toBe(areaExits(area).some(exit => exit.destination === from));
      if (arrival) for (const speed of [-100, 0, 100]) {
        expect(exitAt(area, creators[area]().width, arrival.x, arrival.y, speed)).toBeUndefined();
      }
    }
    for (const width of [NaN, Infinity, -1, 0, 4, 5.5]) expect(arrivalFrom("farm", "forest", width)).toBeNull();
  });

  for (const area of areas) {
    it(`${area}: opens exactly local approaches without mutating the original map or tile objects`, () => {
      const source = creators[area](), before = JSON.stringify(source), result = openAreaExits(source, area);
      expect(result).not.toBe(source); expect(result.tiles).not.toBe(source.tiles);
      const approach = new Set<string>();
      for (const exit of areaExits(area)) for (let row = exit.row; row < exit.row + 2; row++) {
        for (let n = 0; n < 5; n++) approach.add(id(row, exit.edge === "left" ? n : source.width - 1 - n));
      }
      if (area === "forest") for (const row of [19, 20]) {
        for (let offset = 1; offset <= 4; offset++) approach.add(id(row, source.width - 1 - offset));
      }
      for (let row = 0; row < source.height; row++) for (let col = 0; col < source.width; col++) {
        expect(result.tiles[row][col]).not.toBe(source.tiles[row][col]);
        expect(result.tiles[row][col]).toEqual(approach.has(id(row, col)) ? { key: "grass", solid: false } : source.tiles[row][col]);
        if ((row === 0 || row === source.height - 1 || col === 0 || col === source.width - 1) && !approach.has(id(row, col))) {
          expect(result.tiles[row][col].solid).toBe(true);
        }
      }
      result.tiles[0][0].solid = false;
      expect(JSON.stringify(source)).toBe(before);
    });

    it(`${area}: every new exit is reachable from the existing spawn`, () => {
      const world = openAreaExits(creators[area](), area), seen = reachable(world);
      for (const exit of areaExits(area)) for (const row of [exit.row, exit.row + 1]) {
        const col = exit.edge === "left" ? 0 : world.width - 1;
        expect(seen.has(id(row, col))).toBe(true);
      }
    });

    it(`${area}: requires outward movement at the correct edge and inside the body-safe opening`, () => {
      const width = creators[area]().width;
      for (const exit of areaExits(area)) {
        const left = exit.edge === "left", x = left ? 24 : width * 32 - 24, speed = left ? -100 : 100;
        const low = exit.row * 32 + 14, high = (exit.row + 2) * 32 - 14;
        for (const y of [low, (low + high) / 2, high]) expect(exitAt(area, width, x, y, speed)?.id).toBe(exit.id);
        expect(exitAt(area, width, x, low - 0.01, speed)).toBeUndefined();
        expect(exitAt(area, width, x, high + 0.01, speed)).toBeUndefined();
        expect(exitAt(area, width, left ? 24.01 : width * 32 - 24.01, low, speed)).toBeUndefined();
        expect(exitAt(area, width, x, low, -speed)).toBeUndefined();
        expect(exitAt(area, width, x, low, 0)).toBeUndefined();
        expect(exitAt(area, width, left ? -1 : width * 32 + 1, low, speed)).toBeUndefined();
        for (const bad of [NaN, Infinity, -Infinity]) {
          expect(exitAt(area, width, bad, low, speed)).toBeUndefined();
          expect(exitAt(area, width, x, bad, speed)).toBeUndefined();
          expect(exitAt(area, width, x, low, bad)).toBeUndefined();
          expect(exitAt(area, bad, x, low, speed)).toBeUndefined();
        }
      }
    });
  }

  it("clears only the eight inward woodland arrival cells beneath the opening, preserving its boundary", () => {
    const original = createForestMap(), world = openAreaExits(original, "forest"), seen = reachable(world);
    for (const row of [19, 20]) {
      for (let col = 27; col <= 30; col++) {
        expect(world.tiles[row][col]).toEqual({ key: "grass", solid: false });
        expect(seen.has(id(row, col))).toBe(true);
      }
      expect(world.tiles[row][31]).toEqual(original.tiles[row][31]);
      expect(world.tiles[row][31].solid).toBe(true);
      expect(world.tiles[row][26]).toEqual(original.tiles[row][26]);
    }
    for (let col = 27; col <= 31; col++) expect(world.tiles[21][col]).toEqual(original.tiles[21][col]);
    expect(areaExits("forest")).toHaveLength(1);
    expect(areaExits("forest")[0].row).toBe(17);
  });

  it("keeps forest resources and both residents reachable after opening passages", () => {
    for (const source of [createForestMap(), createTownMap()]) {
      const world = openAreaExits(source, source.kind), seen = reachable(world, world.resident);
      for (const target of [world.resident, ...world.nodes]) {
        expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => seen.has(id(target.row + dr, target.col + dc)))).toBe(true);
      }
      for (const node of world.nodes) expect(seen.has(id(node.row, node.col))).toBe(true);
    }
  });
});
