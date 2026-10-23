import type { ParsedMap } from "../../data/maps/farm01.types";
import { TILE } from "../config";

export interface MerchantPlot { row: number; col: number; x: number; y: number }

// Side lawns around spawn; never the shared path between the two prepared fields.
const CANDIDATES = [[18, 12], [18, 10], [20, 13], [18, 14], [10, 14], [8, 13], [16, 15], [20, 11]] as const;
const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const idOf = (row: number, col: number) => `${row}_${col}`;

/** Recover only a complete existing house reservation, not arbitrary reserved cells. */
function homeAccess(reserved: ReadonlySet<string>): { blocked: Set<string>; doors: Set<string> } {
  const blocked = new Set<string>(), doors = new Set<string>();
  for (const id of reserved) {
    if (!/^\d+_\d+$/.test(id)) continue;
    const [row, col] = id.split("_").map(Number);
    const footprint: string[] = [], entrance: string[] = [];
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 4; dc++) footprint.push(idOf(row + dr, col + dc));
    for (let dr = 2; dr < 4; dr++) for (let dc = 1; dc < 3; dc++) entrance.push(idOf(row + dr, col + dc));
    if ([...footprint, ...entrance].every(cell => reserved.has(cell))) {
      footprint.forEach(cell => blocked.add(cell));
      entrance.forEach(cell => doors.add(cell));
    }
  }
  return { blocked, doors };
}

/** Safe placement only. If lawns are occupied, keep the map and existing crops untouched. */
export function chooseMerchantPlot(world: ParsedMap, cultivatedIds: readonly string[], reservedIds: readonly string[]): MerchantPlot | null {
  const cultivated = new Set(cultivatedIds), reserved = new Set(reservedIds);
  const home = homeAccess(reserved);
  const startId = idOf(world.start.row, world.start.col), bedId = idOf(world.bed.row, world.bed.col);
  for (const [col, row] of CANDIDATES) {
    const tile = world.tiles[row]?.[col], id = idOf(row, col);
    if (!tile || tile.solid || tile.key !== "grass" || cultivated.has(id) || reserved.has(id)
      || id === startId || id === bedId) continue;
    const queue = [world.start], visited = new Set([startId]);
    if (home.blocked.has(startId) || world.tiles[world.start.row]?.[world.start.col]?.solid) continue;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      for (const [dr, dc] of DIRECTIONS) {
        const r = current.row + dr, c = current.col + dc, nextId = idOf(r, c);
        const next = world.tiles[r]?.[c];
        if (!next || next.solid || nextId === id || home.blocked.has(nextId) || visited.has(nextId)) continue;
        visited.add(nextId); queue.push({ row: r, col: c });
      }
    }
    if (!visited.has(bedId) || [...home.doors].some(door => !visited.has(door))) continue;
    if (!DIRECTIONS.some(([dr, dc]) => visited.has(idOf(row + dr, col + dc)))) continue;
    return { row, col, x: (col + 0.5) * TILE, y: (row + 0.5) * TILE };
  }
  // Parent retains its keyboard quest/dialog entry when no safe physical NPC fits.
  return null;
}
