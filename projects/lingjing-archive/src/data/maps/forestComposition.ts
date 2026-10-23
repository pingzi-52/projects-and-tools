import type { ExplorationMap } from "./explorationMaps";

// Irregular glades inside the old loop. The outer belt, rocks and fixed interactions stay intact.
const GLADES = [
  [[8, 9, 11], [9, 8, 12], [10, 9, 12]],
  [[14, 17, 19], [15, 17, 21], [16, 18, 20]],
  [[3, 22, 24], [4, 21, 25], [5, 21, 24]],
] as const;

/** Open only trees in three explicit glades on a fresh map, with no gameplay identity changes. */
export function applyForestComposition(map: ExplorationMap): void {
  if (map.kind !== "forest") return;
  const quiet = new Map(map.clearings.map(point => [`${point.row}_${point.col}`, point]));
  for (const glade of GLADES) for (const [row, firstCol, lastCol] of glade) {
    for (let col = firstCol; col <= lastCol; col++) {
      if (row < 2 || row >= map.height - 2 || col < 2 || col >= map.width - 2) continue;
      const tile = map.tiles[row]?.[col];
      if (tile?.key === "tree") map.tiles[row][col] = { key: "grass", solid: false };
      if (map.tiles[row]?.[col]?.key === "grass" && !map.tiles[row][col].solid) {
        quiet.set(`${row}_${col}`, { row, col });
      }
    }
  }
  map.clearings = Array.from(quiet.values());
}
