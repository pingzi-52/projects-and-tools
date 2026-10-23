import type { ParsedMap } from "../../data/maps/farm01.types";
import { TILE } from "../config";

export interface FarmhousePlot {
  col: number;
  row: number;
  width: 4;
  height: 2;
  doorX: number;
  doorY: number;
}

const CANDIDATES = [[10, 3], [16, 3], [21, 3], [18, 11]] as const;

/** Display reservation only. No map or save state is mutated. */
export function containsHomeTile(plot: FarmhousePlot | null, row: number, col: number): boolean {
  return plot !== null && row >= plot.row && row < plot.row + plot.height
    && col >= plot.col && col < plot.col + plot.width;
}

export function chooseFarmhousePlot(world: ParsedMap, cultivatedIds: readonly string[]): FarmhousePlot | null {
  const cultivated = new Set(cultivatedIds);
  const clear = (row: number, col: number): boolean => {
    const tile = world.tiles[row]?.[col];
    return tile?.key === "grass" && !tile.solid && !cultivated.has(`${row}_${col}`)
      && !(row === world.start.row && col === world.start.col)
      && !(row === world.bed.row && col === world.bed.col);
  };
  for (const [col, row] of CANDIDATES) {
    const plot: FarmhousePlot = {
      col, row, width: 4, height: 2,
      doorX: (col + 2) * TILE, doorY: (row + 2) * TILE + TILE / 2,
    };
    let available = true;
    for (let r = row; r < row + 4; r++) {
      const columns = r < row + 2 ? [col, col + 1, col + 2, col + 3] : [col + 1, col + 2];
      if (columns.some(c => !clear(r, c))) { available = false; break; }
    }
    if (!available) continue;
    // Reserving the footprint must not seal off its own entrance from the existing farm.
    const queue = [{ row: world.start.row, col: world.start.col }];
    const visited = new Set([`${world.start.row}_${world.start.col}`]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const point = queue[cursor];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const r = point.row + dr, c = point.col + dc;
        const tile = world.tiles[r]?.[c];
        const id = `${r}_${c}`;
        if (!tile || tile.solid || containsHomeTile(plot, r, c) || visited.has(id)) continue;
        visited.add(id); queue.push({ row: r, col: c });
      }
    }
    if (visited.has(`${row + 2}_${col + 1}`) && visited.has(`${row + 2}_${col + 2}`)) return plot;
  }
  return null;
}
