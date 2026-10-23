import type { ExplorationMap } from "../../data/maps/explorationMaps";
import type { FarmDetail } from "./farmDetails";

/** Plans only decorative plants; gathering nodes remain owned by the map. */
export function planForestDetails(world: ExplorationMap): FarmDetail[] {
  if (world.kind !== "forest") return [];
  const id = (row: number, col: number): string => `${row}_${col}`;
  const paths = new Set(world.paths.map(p => id(p.row, p.col)));
  const clearings = new Set(world.clearings.map(p => id(p.row, p.col)));
  const quiet = [world.start, world.resident, ...world.nodes, ...world.props];
  const cells = new Map<string, FarmDetail>();
  const safe = (row: number, col: number): boolean => {
    const tile = world.tiles[row]?.[col];
    return tile?.key === "grass" && !tile.solid && !paths.has(id(row, col))
      && !quiet.some(p => Math.abs(p.row - row) <= 1 && Math.abs(p.col - col) <= 1);
  };
  const add = (row: number, col: number, kind: FarmDetail["kind"], density: 1 | 2 | 3 = 1): void => {
    if (safe(row, col)) cells.set(id(row, col), { row, col, kind, density });
  };

  // Only a few grass tufts at tree edges; no repeated lawn-wide column pattern.
  for (let row = 2; row < world.height - 2; row++) for (let col = 2; col < world.width - 2; col++) {
    if (clearings.has(id(row, col)) || (row * 19 + col * 11) % 13 !== 0) continue;
    const nearTree = [[-1, 0], [0, -1], [0, 1], [1, 0]].some(([dr, dc]) =>
      world.tiles[row + dr]?.[col + dc]?.key === "tree");
    if (nearTree) add(row, col, "tufts");
  }

  // White flowers frame an open middle rather than carpeting the whole clearing.
  for (const [row, col, density] of [
    [8, 9, 2], [8, 10, 3], [8, 11, 2], [9, 8, 1],
    [9, 12, 1], [10, 9, 2], [10, 10, 2], [10, 12, 1],
  ] as const) add(row, col, "flowers", density);

  // Keep the stone as the focus and its approach open; use low foliage only.
  for (const [row, col, kind] of [
    [14, 17, "tufts"], [14, 19, "tufts"], [15, 17, "shrub"],
    [15, 21, "tufts"], [16, 20, "tufts"],
  ] as const) add(row, col, kind);

  // The existing mushroom node is the sole collectible in this patch.
  for (const [row, col, kind] of [
    [3, 22, "tufts"], [3, 23, "tufts"], [3, 24, "tufts"],
    [4, 21, "shrub"], [4, 25, "tufts"], [5, 21, "tufts"],
  ] as const) add(row, col, kind);

  return [...cells.values()];
}
