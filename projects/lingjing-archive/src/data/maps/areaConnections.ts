import type { ParsedMap } from "./farm01.types";

export type AreaId = "farm" | "forest" | "town";

export interface AreaExit {
  readonly id: string;
  readonly area: AreaId;
  readonly destination: AreaId;
  readonly edge: "left" | "right";
  /** First row of the two-tile-wide walking passage. */
  readonly row: number;
}

const TILE = 32;
const EXITS: Record<AreaId, readonly AreaExit[]> = {
  farm: Object.freeze([
    Object.freeze({ id: "farm-forest", area: "farm", destination: "forest", edge: "left", row: 13 } as const),
    Object.freeze({ id: "farm-town", area: "farm", destination: "town", edge: "right", row: 13 } as const),
  ]),
  forest: Object.freeze([
    Object.freeze({ id: "forest-farm", area: "forest", destination: "farm", edge: "right", row: 17 } as const),
  ]),
  town: Object.freeze([
    Object.freeze({ id: "town-farm", area: "town", destination: "farm", edge: "left", row: 13 } as const),
  ]),
};

export function areaExits(area: AreaId): readonly AreaExit[] {
  return EXITS[area];
}

/** Open local walking approaches and the woodland arrival clearing; leave source maps untouched. */
export function openAreaExits<T extends ParsedMap>(world: T, area: AreaId): T {
  const tiles = world.tiles.map(row => row.map(tile => ({ ...tile })));
  for (const exit of areaExits(area)) {
    for (let row = exit.row; row < exit.row + 2; row++) {
      for (let offset = 0; offset < 5; offset++) {
        const col = exit.edge === "left" ? offset : world.width - 1 - offset;
        if (tiles[row]?.[col]) tiles[row][col] = { key: "grass", solid: false };
      }
    }
  }
  // The two rows below the woodland arrival need headroom for tall foreground crowns.
  // Keep the boundary itself closed: only the original two-row doorway crosses areas.
  if (area === "forest") {
    for (const row of [19, 20]) for (let offset = 1; offset <= 4; offset++) {
      const col = world.width - 1 - offset;
      if (tiles[row]?.[col]) tiles[row][col] = { key: "grass", solid: false };
    }
  }
  return { ...world, tiles };
}

/** Arrive safely inside the matching passage, clear of the outward trigger. */
export function arrivalFrom(area: AreaId, fromArea: AreaId, width: number): { x: number; y: number } | null {
  if (!Number.isInteger(width) || width < 5) return null;
  const exit = areaExits(area).find(candidate => candidate.destination === fromArea);
  if (!exit) return null;
  return { x: exit.edge === "left" ? 80 : width * TILE - 80, y: (exit.row + 1) * TILE };
}

/** Body centre must fit in the passage and be moving outwards; no interaction key required. */
export function exitAt(area: AreaId, width: number, x: number, y: number, velocityX: number): AreaExit | undefined {
  if (!Number.isInteger(width) || width < 5 || ![x, y, velocityX].every(Number.isFinite)) return undefined;
  return areaExits(area).find(exit => {
    const fitsPassage = y >= exit.row * TILE + 14 && y <= (exit.row + 2) * TILE - 14;
    if (!fitsPassage) return false;
    return exit.edge === "left"
      ? velocityX < 0 && x >= 0 && x <= 24
      : velocityX > 0 && x <= width * TILE && x >= width * TILE - 24;
  });
}
