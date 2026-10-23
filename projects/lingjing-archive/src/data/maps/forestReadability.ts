import type { ExplorationMap } from "./explorationMaps";

export const TREE_RENDER_SCALE = 0.65;

export interface ForestTreeBounds {
  left: number; top: number; right: number; bottom: number; feetY: number;
}

const TILE = 32;
// Combined Upper + Lower rectangles from TX Plant.json; kept under an asset contract test.
const TREE_SIZES = [[79, 120], [95, 136], [113, 139]] as const;

/** Same frame selection, scale and bottom-centre origin as FarmEnvironment.render. */
export function forestTreeBounds(row: number, col: number): ForestTreeBounds {
  const [width, height] = TREE_SIZES[(row + col) % TREE_SIZES.length];
  const centreX = col * TILE + TILE / 2, feetY = (row + 1) * TILE;
  return {
    left: centreX - width * TREE_RENDER_SCALE / 2,
    top: feetY - height * TREE_RENDER_SCALE,
    right: centreX + width * TREE_RENDER_SCALE / 2,
    bottom: feetY, feetY,
  };
}

/** Local display clearances only; called after creating a fresh woodland map. */
export function applyForestReadability(map: ExplorationMap): void {
  if (map.kind !== "forest") return;
  const key = (row: number, col: number): string => `${row}_${col}`;
  const interior = (row: number, col: number): boolean =>
    row > 0 && row < map.height - 1 && col > 0 && col < map.width - 1;
  const targets = [
    ...map.nodes.map(point => ({
      left: point.col * TILE + 4, right: point.col * TILE + 28,
      top: (point.row + 1) * TILE - 27, bottom: (point.row + 1) * TILE - 3,
      resident: false,
    })),
    {
      left: map.resident.col * TILE, right: (map.resident.col + 1) * TILE,
      top: (map.resident.row + 1) * TILE - 44, bottom: (map.resident.row + 1) * TILE,
      resident: true,
    },
  ];

  for (let row = 1; row < map.height - 1; row++) for (let col = 1; col < map.width - 1; col++) {
    if (map.tiles[row][col].key !== "tree") continue;
    const tree = forestTreeBounds(row, col);
    // Resources render below every tree. The resident only disappears behind trees to her south.
    if (targets.some(target => (!target.resident || tree.feetY > target.bottom)
      && tree.left < target.right && tree.right > target.left
      && tree.top < target.bottom && tree.bottom > target.top)) {
      map.tiles[row][col] = { key: "grass", solid: false };
    }
  }

  const paths = new Set(map.paths.map(point => key(point.row, point.col)));
  const quiet = new Map<string, { row: number; col: number }>();
  for (const point of [...map.nodes, map.resident]) {
    const lane = point.row <= 8 ? 7 : point.row >= 16 ? 17 : 12;
    // These short connectors already have safe collision clearance in the original generator.
    // Do not clear rocks or props merely to draw a path.
    for (let row = Math.min(lane, point.row); row <= Math.max(lane, point.row); row++) {
      for (const col of [point.col, point.col + 1]) {
        if (!interior(row, col) || map.tiles[row][col].solid || paths.has(key(row, col))) continue;
        map.paths.push({ row, col }); paths.add(key(row, col));
      }
    }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const row = point.row + dr, col = point.col + dc;
      if (interior(row, col) && !map.tiles[row][col].solid) quiet.set(key(row, col), { row, col });
    }
  }
  map.clearings = Array.from(quiet.values());
}
