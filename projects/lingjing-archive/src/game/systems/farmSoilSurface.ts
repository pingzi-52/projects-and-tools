import type Phaser from "phaser";
import type { ParsedMap } from "../../data/maps/farm01.types";
import type { FarmTileState } from "../../domain/models/Crop";
import type { Season } from "../../domain/models/types";
import { grassKey } from "./placeholderAssets";

export const SOIL_SURFACE_TEXTURE = "farm-soil-patch-v2";
export type SoilSurfaceState = "raw" | "dry" | "wet";
const TILE = 32;
const STATES: readonly SoilSurfaceState[] = ["raw", "dry", "wet"];
// Cardinal bits N/E/S/W. The source's outer thirds provide only exposed edges.
export function soilQuarterFrames(state: SoilSurfaceState, neighbors: number): { frame: string; x: number; y: number }[] {
  const quarters = [];
  for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
    const horizontal = neighbors & (qx === 0 ? 8 : 2);
    const vertical = neighbors & (qy === 0 ? 1 : 4);
    const sx = horizontal ? 1 : qx === 0 ? 0 : 2;
    const sy = vertical ? 1 : qy === 0 ? 0 : 2;
    quarters.push({ frame: `${state}_${sx}_${sy}_${qx}_${qy}`, x: qx * 16, y: qy * 16 });
  }
  return quarters;
}

export interface SoilSurfaceCell { id: string; row: number; col: number; state: SoilSurfaceState; neighbors: number }
/** Read-only plan: prepared ground and actually cultivated grass share one connected surface. */
export function planSoilSurface(world: ParsedMap, snap: Readonly<Record<string, FarmTileState>>, replaceBed: boolean): SoilSurfaceCell[] {
  const cells = new Map<string, SoilSurfaceCell>();
  for (let row = 0; row < world.height; row++) for (let col = 0; col < world.width; col++) {
    const key = world.tiles[row][col].key;
    if (key === "soil" || (replaceBed && key === "bed")) {
      const id = `${row}_${col}`;
      cells.set(id, { id, row, col, state: "raw", neighbors: 0 });
    }
  }
  for (const [id, tile] of Object.entries(snap)) {
    const [row, col] = id.split("_").map(Number);
    const key = world.tiles[row]?.[col]?.key;
    if (!tile.tilled || id !== `${row}_${col}` || (key !== "soil" && key !== "grass")) continue;
    cells.set(id, { id, row, col, state: tile.watered ? "wet" : "dry", neighbors: 0 });
  }
  for (const cell of cells.values()) {
    const { row, col } = cell;
    cell.neighbors = (cells.has(`${row - 1}_${col}`) ? 1 : 0)
      | (cells.has(`${row}_${col + 1}`) ? 2 : 0)
      | (cells.has(`${row + 1}_${col}`) ? 4 : 0)
      | (cells.has(`${row}_${col - 1}`) ? 8 : 0);
  }
  return [...cells.values()];
}

/** Four atlas quarters render each logical tile; no physics or gameplay state is created. */
export class FarmSoilSurface {
  readonly ready: boolean;
  private readonly surfaces = new Map<string, Phaser.GameObjects.Image[]>();
  private readonly underlays: Phaser.GameObjects.Image[] = [];
  private readonly nativeGrass: boolean;

  constructor(private readonly scene: Phaser.Scene, private readonly world: ParsedMap, private readonly replaceBed: boolean) {
    const atlas = scene.textures.exists(SOIL_SURFACE_TEXTURE) ? scene.textures.get(SOIL_SURFACE_TEXTURE) : undefined;
    this.ready = !!atlas && STATES.every(state => Array.from({ length: 16 }, (_, mask) => mask)
      .every(mask => soilQuarterFrames(state, mask).every(q => atlas.has(q.frame))));
    this.nativeGrass = scene.textures.exists("TX Tileset Grass") && scene.textures.get("TX Tileset Grass").has("TX Tileset Grass 0");
    if (!this.ready) return;
    // Transparent rims reveal the same grass as the surroundings, never the old opaque soil.
    for (const cell of planSoilSurface(world, {}, replaceBed)) {
      const { row, col } = cell;
      const image = this.nativeGrass
        ? scene.add.image(col * TILE + 16, row * TILE + 16, "TX Tileset Grass", `TX Tileset Grass ${(row * 13 + col * 7) % 3}`)
        : scene.add.image(col * TILE + 16, row * TILE + 16, grassKey("spring", (row * 13 + col * 7) % 4));
      this.underlays.push(image.setDisplaySize(TILE, TILE).setDepth(0.5));
    }
    this.update({});
  }

  update(snap: Readonly<Record<string, FarmTileState>>): void {
    if (!this.ready) return;
    const next = new Set<string>();
    for (const cell of planSoilSurface(this.world, snap, this.replaceBed)) {
      next.add(cell.id);
      const plan = soilQuarterFrames(cell.state, cell.neighbors);
      let images = this.surfaces.get(cell.id);
      if (!images) {
        images = plan.map(q => this.scene.add.image(0, 0, SOIL_SURFACE_TEXTURE, q.frame).setOrigin(0));
        this.surfaces.set(cell.id, images);
      }
      for (let i = 0; i < plan.length; i++) {
        const q = plan[i];
        images[i].setFrame(q.frame).setDisplaySize(16, 16)
          .setPosition(cell.col * TILE + q.x, cell.row * TILE + q.y).setDepth(cell.state === "raw" ? 1 : 4);
      }
    }
    for (const [id, images] of this.surfaces) {
      if (!next.has(id)) { images.forEach(image => image.destroy()); this.surfaces.delete(id); }
    }
  }

  applySeason(season: Season): void {
    const tint = { spring: 0xffffff, summer: 0xf5efcc, autumn: 0xe5b781, winter: 0xc8d6df }[season];
    for (const image of this.underlays) {
      if (this.nativeGrass) image.setTint(tint);
      else {
        const row = Math.floor(image.y / TILE), col = Math.floor(image.x / TILE);
        image.setTexture(grassKey(season, (row * 13 + col * 7) % 4));
      }
    }
  }

  destroy(): void {
    for (const images of this.surfaces.values()) images.forEach(image => image.destroy());
    this.surfaces.clear();
    this.underlays.forEach(image => image.destroy());
    this.underlays.length = 0;
  }
}
