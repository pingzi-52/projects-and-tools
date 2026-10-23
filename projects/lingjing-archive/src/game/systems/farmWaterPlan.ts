import type { ParsedMap } from "../../data/maps/farm01.types";

export type ShoreSide = "north" | "east" | "south" | "west";
export interface WaterCell {
  row: number;
  col: number;
  edges: ShoreSide[];
  /** Shared source coordinates, so adjoining water cells have no texture seam. */
  sourceCol: number;
  sourceRow: number;
}
export interface WaterPlan {
  cells: WaterCell[];
  width: number;
  height: number;
}

/** Read-only visual plan. It never changes terrain, passability or saved state. */
export function planFarmWater(world: ParsedMap): WaterPlan {
  const cells: WaterCell[] = [];
  const directions = [
    ["north", -1, 0], ["east", 0, 1], ["south", 1, 0], ["west", 0, -1],
  ] as const;
  let minRow = Infinity, minCol = Infinity, maxRow = -1, maxCol = -1;
  for (let row = 0; row < world.height; row++) {
    for (let col = 0; col < world.width; col++) {
      if (world.tiles[row]?.[col]?.key !== "water") continue;
      const edges: ShoreSide[] = [];
      for (const [side, dr, dc] of directions) {
        if (world.tiles[row + dr]?.[col + dc]?.key !== "water") edges.push(side);
      }
      cells.push({ row, col, edges, sourceCol: 0, sourceRow: 0 });
      minRow = Math.min(minRow, row); minCol = Math.min(minCol, col);
      maxRow = Math.max(maxRow, row); maxCol = Math.max(maxCol, col);
    }
  }
  if (!cells.length) return { cells, width: 0, height: 0 };
  for (const cell of cells) {
    cell.sourceCol = cell.col - minCol;
    cell.sourceRow = cell.row - minRow;
  }
  return { cells, width: maxCol - minCol + 1, height: maxRow - minRow + 1 };
}
