import type { ParsedMap } from "../../data/maps/farm01.types";

export interface FarmDetail {
  row: number;
  col: number;
  kind: "flowers" | "tufts" | "shrub";
  density?: 1 | 2 | 3;
}

/** Small art patches, never terrain edits. Each decoration stays inside its tile. */
export function planFarmDetails(world: ParsedMap, reservedIds: readonly string[] = []): FarmDetail[] {
  const cells = new Map<string, FarmDetail>();
  const reserved = new Set(reservedIds);
  const safe = (row: number, col: number): boolean => {
    const tile = world.tiles[row]?.[col];
    if (!tile || tile.key !== "grass" || tile.solid || reserved.has(`${row}_${col}`)) return false;
    if (row === 13 || row === 14) return false;
    if (Math.abs(row - world.start.row) <= 1 && Math.abs(col - world.start.col) <= 1) return false;
    if (Math.abs(row - world.bed.row) <= 1 && Math.abs(col - world.bed.col) <= 1) return false;
    // Keep the central approach between the spawn and cultivated beds clear.
    return !(col >= 11 && col <= 13 && row >= 5 && row <= 15);
  };
  const add = (row: number, col: number, kind: FarmDetail["kind"], density: 1 | 2 | 3): void => {
    if (safe(row, col)) cells.set(`${row}_${col}`, { row, col, kind, density });
  };
  for (const [row, col] of [[6, 5], [6, 17], [11, 8], [11, 17]]) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const distance = Math.abs(dr) + Math.abs(dc);
        if (distance > 2) continue;
        // An asymmetric missing edge opens each clump towards the surrounding lawn.
        if (distance === 2 && (row + col + dr * 3 + dc * 7) % 3 === 0) continue;
        const flowers = distance === 0 || (dr + dc + row) % 2 === 0;
        const density = distance === 0 ? 3 : distance === 1 ? 2 : 1;
        add(row + dr, col + dc, flowers ? "flowers" : "tufts", flowers ? density : 1);
      }
    }
  }
  for (let row = 3; row <= Math.min(18, world.height - 1); row++) {
    for (let col = 3; col <= Math.min(20, world.width - 1); col++) {
      if (world.tiles[row]?.[col]?.key !== "tree") continue;
      // Only one side and a diagonal, leaving a visible gap around the trunk.
      const side = (row + col) % 2 === 0 ? -1 : 1;
      for (const [dr, dc] of [[0, side], [1, -side]]) {
        if (!cells.has(`${row + dr}_${col + dc}`)) add(row + dr, col + dc, "tufts", 1);
      }
    }
  }
  // Low plants follow the pond's outer bank without drawing a continuous border.
  for (const [row, col, kind] of [
    [15, 25, "tufts"], [15, 28, "shrub"], [16, 24, "tufts"],
    [18, 24, "shrub"], [19, 25, "tufts"], [20, 27, "tufts"],
  ] as const) add(row, col, kind, 1);
  return [...cells.values()];
}
