import { describe, expect, it } from "vitest";
import { createForestMap, createTownMap, type ExplorationMap, type MapCell } from "../src/data/maps/explorationMaps";
import { forestTreeBounds } from "../src/data/maps/forestReadability";
import { openAreaExits } from "../src/data/maps/areaConnections";

// Collision snapshot before the readability pass: T=tree, R=rock, S=blocking prop.
const ORIGINAL_TILES = [
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT", "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT", "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTT...TTT.TTTT.TTT...TTT.TTT", "TTTTT.T...RTTTT..TTT.T...RTTTTTT",
  "TTTTT.......................TTTT", "TTTT........................TTTT",
  "TTTT....TTT.TTT..TTTT.TTT..TTTTT", "TTTT.....TTTT.T.....TTT.T..T.TTT",
  "TTTTTR..TT.TTTT.....RTTTT..TTTTT", "TTTTTT......................TTTT",
  "TTTT.T......................TTTT", "TTTTTT.....RTTT..TTTT......TTTTT",
  "TTTTTT.....TTRT..T.TTT.....TRTTT", "TTTTT...TT.T.....TTT.TTTT....TTT",
  "TTTTTT..TTTS.....RTTTT.TT....TTT", "TTTTR........................TTT",
  "TTTTT.......................TTTT", "TTTTTT...TTTT....T.T...RT..T.TTT",
  "TTTTT....TRTTT...TST...TTRTTTTTT", "TTTTTTTTTTTTTT...TTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTT..TTTTTTTTTTTTTTT", "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
];
const ORIGINAL_NODES = [
  { id: "wood_a", itemId: "branch", row: 5, col: 8 },
  { id: "wood_b", itemId: "branch", row: 10, col: 18 },
  { id: "wood_c", itemId: "branch", row: 19, col: 7 },
  { id: "stone_a", itemId: "stone", row: 8, col: 5 },
  { id: "stone_b", itemId: "stone", row: 13, col: 23 },
  { id: "stone_c", itemId: "stone", row: 19, col: 21 },
  { id: "mushroom_a", itemId: "wild_mushroom", row: 5, col: 23 },
  { id: "mushroom_b", itemId: "wild_mushroom", row: 13, col: 9 },
  { id: "mushroom_c", itemId: "wild_mushroom", row: 16, col: 27 },
];
const key = (point: MapCell): string => `${point.row}_${point.col}`;
// Explicitly approved composition cells, independent of the production glade planner.
const COMPOSITION_TREES = new Set([
  "8_9", "8_10", "9_9", "9_10", "9_11", "9_12", "10_9", "10_11", "10_12",
  "14_17", "14_19", "15_17", "15_18", "15_19", "15_21", "16_18", "16_19", "16_20",
  "3_22", "3_23", "3_24", "4_21", "4_25", "5_21",
]);
const overlaps = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function targets(map: ExplorationMap) {
  return [
    ...map.nodes.map(point => ({ row: point.row, col: point.col, left: point.col * 32 + 4, right: point.col * 32 + 28,
      top: (point.row + 1) * 32 - 27, bottom: (point.row + 1) * 32 - 3, resident: false })),
    { row: map.resident.row, col: map.resident.col, left: map.resident.col * 32, right: (map.resident.col + 1) * 32,
      top: (map.resident.row + 1) * 32 - 44, bottom: (map.resident.row + 1) * 32, resident: true },
  ];
}

// Independent reference geometry from the three actual combined Cainos frames.
function referenceTreeBounds(row: number, col: number) {
  const [width, height] = [[79, 120], [95, 136], [113, 139]][(row + col) % 3];
  return { left: col * 32 + 16 - width * 0.65 / 2, right: col * 32 + 16 + width * 0.65 / 2,
    top: (row + 1) * 32 - height * 0.65, bottom: (row + 1) * 32, feetY: (row + 1) * 32 };
}

function originalPathCells(): Set<string> {
  const cells = new Set<string>();
  const square = (r: number, c: number) => {
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) cells.add(`${r + dr}_${c + dc}`);
  };
  for (let r = 5; r <= 21; r++) square(r, 15);
  for (let c = 5; c <= 26; c++) { square(6, c); square(17, c); }
  for (let r = 6; r <= 18; r++) { square(r, 6); square(r, 25); }
  for (let c = 6; c <= 26; c++) square(11, c);
  return cells;
}

function originalTile(row: number, col: number) {
  const symbol = ORIGINAL_TILES[row][col];
  return { key: symbol === "T" ? "tree" : symbol === "R" ? "rock" : "grass", solid: symbol !== "." };
}

function bodyReachable(map: ExplorationMap): Set<string> {
  const resident = { left: map.resident.col * 32, right: (map.resident.col + 1) * 32,
    top: map.resident.row * 32 + 2, bottom: (map.resident.row + 1) * 32 - 2 };
  const fits = (row: number, col: number): boolean => {
    if (!map.tiles[row]?.[col]) return false;
    const body = { left: col * 32, right: (col + 1) * 32, top: row * 32 + 2, bottom: (row + 1) * 32 - 2 };
    if (overlaps(body, resident)) return false;
    for (let r = row - 1; r <= row + 1; r++) for (let c = col - 1; c <= col + 1; c++) {
      if (map.tiles[r]?.[c]?.solid && overlaps(body, { left: c * 32, right: (c + 1) * 32, top: r * 32, bottom: (r + 1) * 32 })) return false;
    }
    return true;
  };
  const seen = new Set<string>([key(map.start)]), queue = [map.start];
  for (let index = 0; index < queue.length; index++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const next = { row: queue[index].row + dr, col: queue[index].col + dc };
      if (fits(next.row, next.col) && !seen.has(key(next))) { seen.add(key(next)); queue.push(next); }
    }
  }
  return seen;
}

describe("local forest readability", () => {
  it("keeps the nine resource identities and positions, start, resident, props and buildings", () => {
    const map = createForestMap();
    expect([map.width, map.height]).toEqual([32, 24]);
    expect(map.nodes).toEqual(ORIGINAL_NODES);
    expect(map.start).toEqual({ row: 20, col: 15 }); expect(map.bed).toEqual(map.start);
    expect(map.resident).toEqual({ row: 16, col: 13 });
    expect(map.props).toEqual([
      { row: 16, col: 11, frame: "TX Props Road Sign E", blocking: true },
      { row: 20, col: 18, frame: "TX Props Stone Bench S", blocking: true },
    ]);
    expect(map.buildings).toEqual([]);
  });

  it("preserves all original loop path cells and adds two-column spurs for each resource and resident", () => {
    const map = createForestMap(), paths = new Set(map.paths.map(key));
    expect(originalPathCells().size).toBe(192);
    for (const id of originalPathCells()) expect(paths.has(id), `original path ${id}`).toBe(true);
    for (const point of [...map.nodes, map.resident]) {
      const lane = point.row <= 8 ? 7 : point.row >= 16 ? 17 : 12;
      for (let row = Math.min(lane, point.row); row <= Math.max(lane, point.row); row++) {
        for (const col of [point.col, point.col + 1]) {
          expect(paths.has(`${row}_${col}`), `spur ${row}_${col}`).toBe(true);
          expect(map.tiles[row][col].solid).toBe(false);
        }
      }
    }
    expect(paths.size).toBe(map.paths.length);
  });

  it("removes only the original 13 occluders and 24 explicitly approved composition trees", () => {
    const map = createForestMap(), points = targets(map);
    let changed = 0;
    for (let row = 0; row < 24; row++) for (let col = 0; col < 32; col++) {
      const before = originalTile(row, col), after = map.tiles[row][col];
      const tree = referenceTreeBounds(row, col);
      const obstructs = points.some(target => (!target.resident || tree.feetY > target.bottom) && overlaps(tree, target));
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changed++;
        expect(row > 0 && row < 23 && col > 0 && col < 31).toBe(true);
        expect(before).toEqual({ key: "tree", solid: true });
        expect(after).toEqual({ key: "grass", solid: false });
        expect(obstructs || COMPOSITION_TREES.has(`${row}_${col}`), `unapproved clearing ${row}_${col}`).toBe(true);
      }
      if (before.key === "tree" && row > 0 && row < 23 && col > 0 && col < 31 && obstructs) {
        expect(after.key, `hidden target behind ${row}_${col}`).toBe("grass");
      }
    }
    expect(changed).toBe(37);
    for (const id of COMPOSITION_TREES) {
      const [row, col] = id.split("_").map(Number);
      expect(originalTile(row, col)).toEqual({ key: "tree", solid: true });
      expect(map.tiles[row][col]).toEqual({ key: "grass", solid: false });
    }
    expect(map.tiles.flat().filter(tile => tile.key === "tree").length).toBeGreaterThan(250);
  });

  it("leaves all nine 24px resource boxes and the guide's 32x44px box unobscured by foreground tree bounds", () => {
    const map = createForestMap();
    for (const target of targets(map)) for (let row = 0; row < 24; row++) for (let col = 0; col < 32; col++) {
      if (map.tiles[row][col].key !== "tree") continue;
      const tree = referenceTreeBounds(row, col);
      if (target.resident && tree.feetY <= target.bottom) continue;
      expect(overlaps(tree, target), `target ${target.row}_${target.col} behind tree ${row}_${col}`).toBe(false);
    }
  });

  it("exports the same scaled tree envelopes used by the actual three atlas frames", () => {
    for (const [row, col] of [[1, 2], [1, 3], [1, 4], [19, 27]]) {
      expect(forestTreeBounds(row, col)).toEqual(referenceTreeBounds(row, col));
    }
  });

  it("records only resource/resident quiet cells and the three approved glade footprints", () => {
    const map = createForestMap(), expected = new Set<string>();
    for (const point of [...map.nodes, map.resident]) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const row = point.row + dr, col = point.col + dc;
        if (!map.tiles[row][col].solid) expected.add(`${row}_${col}`);
      }
    }
    for (const [row, first, last] of [[8, 9, 11], [9, 8, 12], [10, 9, 12], [14, 17, 19], [15, 17, 21], [16, 18, 20], [3, 22, 24], [4, 21, 25], [5, 21, 24]]) {
      for (let col = first; col <= last; col++) expected.add(`${row}_${col}`);
    }
    expect(new Set(map.clearings.map(key))).toEqual(expected);
    expect(map.clearings.length).toBe(expected.size);
    expect(createTownMap().clearings).toEqual([]);
  });

  it("keeps every gathering point and all four guide approaches reachable by the 32x28px player body", () => {
    const map = createForestMap(), seen = bodyReachable(map);
    for (const point of map.nodes) expect(seen.has(key(point))).toBe(true);
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      expect(seen.has(key({ row: map.resident.row + dr, col: map.resident.col + dc }))).toBe(true);
    }
  });

  it("keeps the border closed and lets only the existing two-row east passage open", () => {
    const map = createForestMap(), opened = openAreaExits(map, "forest");
    for (let row = 0; row < 24; row++) for (let col = 0; col < 32; col++) {
      if (row && col && row !== 23 && col !== 31) continue;
      expect(map.tiles[row][col]).toEqual({ key: "tree", solid: true });
      expect(opened.tiles[row][col].solid).toBe(!(col === 31 && (row === 17 || row === 18)));
    }
  });

  it("returns deterministic fresh clearings, paths, nodes and tiles with no shared mutable arrays", () => {
    const first = createForestMap(), second = createForestMap(); expect(first).toEqual(second);
    expect(first.clearings.length).toBeGreaterThan(0);
    first.clearings[0].row = 0; first.paths[0].row = 0; first.nodes[0].col = 0; first.tiles[1][1].solid = false;
    expect(first.clearings).not.toEqual(second.clearings); expect(first.paths).not.toEqual(second.paths);
    expect(first.nodes).not.toEqual(second.nodes); expect(first.tiles).not.toEqual(second.tiles);
  });
});
