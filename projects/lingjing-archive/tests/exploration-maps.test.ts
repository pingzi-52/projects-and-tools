import { describe, expect, it } from "vitest";
import { createForestMap, createTownMap, type ExplorationMap } from "../src/data/maps/explorationMaps";
import { parseFarm01 } from "../src/data/maps/farm01";

function reachable(map: ExplorationMap): Set<string> {
  const queue = [map.start], seen = new Set([`${map.start.row}_${map.start.col}`]);
  for (let i = 0; i < queue.length; i++) for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const row = queue[i].row + dr, col = queue[i].col + dc, id = `${row}_${col}`;
    if (!map.tiles[row]?.[col] || map.tiles[row][col].solid || (row === map.resident.row && col === map.resident.col) || seen.has(id)) continue;
    seen.add(id); queue.push({ row, col });
  }
  return seen;
}

describe("small beta exploration layouts", () => {
  for (const [name, create] of [["forest", createForestMap], ["town", createTownMap]] as const) {
    it(`${name} has a closed 32x24 border, safe spawn and reachable resident and resources`, () => {
      const map = create(), seen = reachable(map);
      expect(map.width).toBe(32); expect(map.height).toBe(24);
      expect(map.tiles).toHaveLength(24);
      for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) {
        if (!r || !c || r === 23 || c === 31) expect(map.tiles[r][c].solid).toBe(true);
      }
      expect(map.tiles[map.start.row][map.start.col].solid).toBe(false);
      expect(map.tiles[map.resident.row][map.resident.col].solid).toBe(false);
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        expect(seen.has(`${map.resident.row + dr}_${map.resident.col + dc}`)).toBe(true);
      }
      for (const point of [map.resident, ...map.nodes]) {
        expect([[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dr, dc]) => seen.has(`${point.row + dr}_${point.col + dc}`))).toBe(true);
      }
      for (const node of map.nodes) expect(seen.has(`${node.row}_${node.col}`)).toBe(true);
      for (const prop of map.props) expect(map.tiles[prop.row][prop.col].solid).toBe(prop.blocking);
    });
    it(`${name} creates fresh deterministic data and does not alter the existing farm`, () => {
      const before = JSON.stringify(parseFarm01());
      const first = create(), second = create(); expect(first).toEqual(second);
      first.tiles[1][1].solid = !first.tiles[1][1].solid;
      expect(first.tiles[1][1]).not.toEqual(second.tiles[1][1]);
      expect(JSON.stringify(parseFarm01())).toBe(before);
    });
  }
  it("forest supplies exactly three daily points for each material with stable unique IDs", () => {
    const map = createForestMap();
    expect(map.nodes.map(n => n.id).sort()).toEqual(["wood_a", "wood_b", "wood_c", "stone_a", "stone_b", "stone_c", "mushroom_a", "mushroom_b", "mushroom_c"].sort());
    expect(new Set(map.nodes.map(n => `${n.row}_${n.col}`)).size).toBe(9);
    for (const type of ["branch", "stone", "wild_mushroom"]) expect(map.nodes.filter(n => n.itemId === type)).toHaveLength(3);
    expect(map.tiles.flat().filter(t => t.key === "tree").length).toBeGreaterThan(250);
    expect(createTownMap().nodes).toEqual([]);
  });
  it("town workshops do not overlap the public paths, entrance or resident", () => {
    const map = createTownMap(), pathIds = new Set(map.paths.map(p => `${p.row}_${p.col}`));
    expect(map.buildings).toHaveLength(2);
    for (const b of map.buildings) for (let r = b.row; r < b.row + b.height; r++) for (let c = b.col; c < b.col + b.width; c++) {
      expect(pathIds.has(`${r}_${c}`)).toBe(false); expect(map.tiles[r][c].solid).toBe(true);
    }
  });
});
