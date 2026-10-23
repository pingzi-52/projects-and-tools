import { applyForestReadability } from "./forestReadability";
import { applyForestComposition } from "./forestComposition";
import type { ParsedMap } from "./farm01.types";

export type ExplorationKind = "forest" | "town";
export interface MapCell { row: number; col: number }
export interface ForageNode extends MapCell { id: string; itemId: "branch" | "stone" | "wild_mushroom" }
export interface ExplorationMap extends ParsedMap {
  kind: ExplorationKind;
  resident: MapCell;
  nodes: ForageNode[];
  paths: MapCell[];
  clearings: MapCell[];
  props: (MapCell & { frame: string; blocking: boolean })[];
  buildings: (MapCell & { width: number; height: number; label: string })[];
}

const key = (r: number, c: number) => `${r}_${c}`;

function base(kind: ExplorationKind): ExplorationMap {
  const width = 32, height = 24;
  return {
    kind, width, height,
    tiles: Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
      const border = r === 0 || c === 0 || r === height - 1 || c === width - 1;
      return { key: border ? "tree" as const : "grass" as const, solid: border };
    })),
    start: { row: 20, col: 15 }, bed: { row: 20, col: 15 },
    resident: { row: kind === "forest" ? 16 : 11, col: kind === "forest" ? 13 : 18 },
    nodes: [], paths: [], clearings: [], props: [], buildings: [],
  };
}

function addPath(map: ExplorationMap, row: number, col: number, width = 1): void {
  for (let dr = 0; dr < width; dr++) for (let dc = 0; dc < width; dc++) {
    const r = row + dr, c = col + dc;
    if (r < 1 || c < 1 || r >= map.height - 1 || c >= map.width - 1) continue;
    if (!map.paths.some(p => p.row === r && p.col === c)) map.paths.push({ row: r, col: c });
  }
}

/** A connected woodland loop with gathering pockets, generated without touching farm01. */
export function createForestMap(): ExplorationMap {
  const map = base("forest");
  for (let r = 5; r <= 21; r++) addPath(map, r, 15, 2);
  for (let c = 5; c <= 26; c++) { addPath(map, 6, c, 2); addPath(map, 17, c, 2); }
  for (let r = 6; r <= 18; r++) { addPath(map, r, 6, 2); addPath(map, r, 25, 2); }
  for (let c = 6; c <= 26; c++) addPath(map, 11, c, 2);
  map.nodes = [
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
  const protectedCells = new Set(map.paths.map(p => key(p.row, p.col)));
  // One full tile around each point leaves room for the player's 32px body and E.
  for (const p of [map.start, map.resident, ...map.nodes]) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) protectedCells.add(key(p.row + dr, p.col + dc));
    // Link resource pockets to the nearest loop lane even when their corner lies outside it.
    const targetRow = p.row <= 8 ? 7 : p.row >= 16 ? 17 : 12;
    for (let r = Math.min(targetRow, p.row); r <= Math.max(targetRow, p.row); r++) {
      for (let dc = -1; dc <= 1; dc++) protectedCells.add(key(r, p.col + dc));
    }
  }
  for (let r = 1; r < 23; r++) for (let c = 1; c < 31; c++) {
    if (protectedCells.has(key(r, c))) continue;
    const edge = r < 4 || r > 20 || c < 4 || c > 28;
    if (edge || (r * 11 + c * 7) % 5 !== 0) map.tiles[r][c] = { key: "tree", solid: true };
    else if ((r * 13 + c) % 3 === 0) map.tiles[r][c] = { key: "rock", solid: true };
  }
  map.props = [
    { row: 16, col: 11, frame: "TX Props Road Sign E", blocking: true },
    { row: 20, col: 18, frame: "TX Props Stone Bench S", blocking: true },
  ];
  for (const prop of map.props) map.tiles[prop.row][prop.col] = { key: "grass", solid: prop.blocking };
  applyForestReadability(map);
  applyForestComposition(map);
  return map;
}

/** Compact workshop square: houses, porch lanes, benches, well and a broad central walk. */
export function createTownMap(): ExplorationMap {
  const map = base("town");
  for (let r = 9; r <= 21; r++) addPath(map, r, 14, 3);
  for (let c = 4; c <= 27; c++) addPath(map, 12, c, 3);
  for (let r = 9; r <= 13; r++) { addPath(map, r, 8, 2); addPath(map, r, 22, 2); }
  map.buildings = [
    { row: 6, col: 6, width: 6, height: 3, label: "木匠工坊" },
    { row: 6, col: 20, width: 6, height: 3, label: "林缘会馆" },
  ];
  // Broaden only the two existing entrances; preserve buildings, props and the old street.
  for (const building of map.buildings) {
    for (let r = building.row + building.height; r < building.row + building.height + 2; r++) {
      for (let c = building.col + 1; c < building.col + building.width - 1; c++) addPath(map, r, c);
    }
  }
  for (const b of map.buildings) for (let r = b.row; r < b.row + b.height; r++) {
    for (let c = b.col; c < b.col + b.width; c++) map.tiles[r][c] = { key: "grass", solid: true };
  }
  const pathIds = new Set(map.paths.map(p => key(p.row, p.col)));
  for (let r = 1; r < 23; r++) for (let c = 1; c < 31; c++) {
    if (map.tiles[r][c].solid || pathIds.has(key(r, c))) continue;
    if (r < 3 || c < 3 || c > 28 || (r > 17 && (c < 9 || c > 23))) {
      if ((r + c) % 2 === 0) map.tiles[r][c] = { key: "tree", solid: true };
    }
  }
  map.props = [
    { row: 11, col: 10, frame: "TX Props Well", blocking: true },
    { row: 11, col: 6, frame: "TX Props Barrel", blocking: true },
    { row: 10, col: 12, frame: "TX Props Crate", blocking: true },
    { row: 16, col: 22, frame: "TX Props Stone Bench S", blocking: true },
    { row: 16, col: 10, frame: "TX Props Stone Bench S", blocking: true },
    { row: 10, col: 26, frame: "TX Props Pot A", blocking: true },
    { row: 19, col: 18, frame: "TX Props Road Sign W", blocking: true },
    { row: 10, col: 20, frame: "TX Props Crate Small", blocking: true },
  ];
  for (const prop of map.props) map.tiles[prop.row][prop.col] = { key: "grass", solid: prop.blocking };
  return map;
}
