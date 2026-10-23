import Phaser from "phaser";
import type { TileDef } from "../../data/maps/farm01.types";
import type { Season } from "../../domain/models/types";
import { TILE } from "../config";
import type { ParsedMap } from "../../data/maps/farm01.types";
import { planFarmDetails, type FarmDetail } from "./farmDetails";
import { detailSprites } from "./detailSprites";
import { TREE_RENDER_SCALE } from "../../data/maps/forestReadability";

// Only this module knows the current environment pack. Gameplay keeps its tile keys.
const PACK = "farm-assets/cainos-basic/";
const SHEETS = ["TX Plant", "TX Props", "TX Tileset Grass"] as const;
const FENCE = "farm-wood-fence";
const REPLACED = new Set<TileDef["key"]>(["grass", "tree", "rock", "fence"]);
const TINT: Record<Season, number> = {
  spring: 0xffffff, summer: 0xf5efcc, autumn: 0xe5b781, winter: 0xc8d6df,
};

export class FarmEnvironment {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly trees: Phaser.GameObjects.Image[] = [];
  get treeImages(): readonly Phaser.GameObjects.Image[] { return this.trees; }
  private readonly ready: boolean;
  private readonly details = new Map<string, Phaser.GameObjects.Image[]>();

  static preload(scene: Phaser.Scene): void {
    const base = import.meta.env.BASE_URL;
    for (const sheet of SHEETS) {
      if (!scene.textures.exists(sheet)) {
        scene.load.atlas(sheet, `${base}${PACK}${sheet}.png`, `${base}${PACK}${sheet}.json`);
      }
    }
    if (!scene.textures.exists(FENCE)) {
      const path = `${base}farm-assets/original-addons/v1/wood-fence-v1`;
      scene.load.atlas(FENCE, `${path}.png`, `${path}.json`);
    }
  }

  constructor(private readonly scene: Phaser.Scene) {
    this.ready = [...SHEETS, FENCE].every(key => scene.textures.exists(key));
    if (!this.ready) return; // Original art and collision remain intact on load failure.
    const plants = scene.textures.get("TX Plant");
    for (const type of ["T1", "T2", "T3"]) {
      const name = `farm-tree-${type}`;
      if (plants.has(name)) continue;
      const upper = plants.get(`TX Tree ${type} Upper`);
      const lower = plants.get(`TX Tree ${type} Lower`);
      plants.add(name, 0, upper.cutX, upper.cutY, upper.cutWidth,
        lower.cutY + lower.cutHeight - upper.cutY);
    }
  }

  render(tile: TileDef, row: number, col: number, verticalFence: boolean): boolean {
    if (!this.ready || !REPLACED.has(tile.key)) return false;
    const x = col * TILE, y = row * TILE;
    const grass = this.scene.add.image(x, y, "TX Tileset Grass",
      `TX Tileset Grass ${(row * 13 + col * 7) % 3}`).setOrigin(0).setDepth(0);
    this.images.push(grass);
    if (tile.key === "tree") {
      const type = ["T1", "T2", "T3"][(row + col) % 3];
      const tree = this.scene.add.image(x + TILE / 2, y + TILE, "TX Plant",
        `farm-tree-${type}`).setOrigin(0.5, 1).setScale(TREE_RENDER_SCALE)
        .setDepth(FarmEnvironment.objectDepth(y + TILE));
      this.images.push(tree); this.trees.push(tree);
    } else if (tile.key === "rock") {
      this.images.push(this.scene.add.image(x + TILE / 2, y + TILE, "TX Props",
        "TX Props - Stone 06").setOrigin(0.5, 1).setDisplaySize(32, 30)
        .setDepth(FarmEnvironment.objectDepth(y + TILE)));
    } else if (tile.key === "fence") {
      this.images.push(this.scene.add.image(x + TILE / 2, y + TILE, FENCE,
        verticalFence ? "vertical" : "horizontal").setOrigin(0.5, 1)
        .setDisplaySize(verticalFence ? 10 : 32, verticalFence ? 32 : 22)
        .setDepth(FarmEnvironment.objectDepth(y + TILE)));
    }
    return true;
  }

  static objectDepth(feetY: number): number { return 10 + feetY / 10000; }

  renderDetails(world: ParsedMap, reservedIds: readonly string[] = []): void {
    this.renderDetailPlan(planFarmDetails(world, reservedIds));
  }

  renderDetailPlan(plan: readonly FarmDetail[]): void {
    if (!this.ready) return;
    const plants = this.scene.textures.get("TX Plant");
    for (const detail of plan) {
      const x = detail.col * TILE, y = detail.row * TILE;
      const sprites: Phaser.GameObjects.Image[] = [];
      for (const { x: dx, y: dy, frame } of detailSprites(detail)) {
        if (!plants.has(frame)) continue;
        const bounds = this.scene.textures.getFrame("TX Plant", frame);
        if (bounds.width > TILE || bounds.height > TILE) continue;
        const px = Math.max(bounds.width / 2, Math.min(TILE - bounds.width / 2, dx));
        const py = Math.max(bounds.height, Math.min(TILE, dy));
        const image = this.scene.add.image(x + px, y + py, "TX Plant", frame)
          .setOrigin(0.5, 1).setDepth(2);
        sprites.push(image);
        this.images.push(image);
      }
      this.details.set(`${detail.row}_${detail.col}`, sprites);
    }
  }

  setCultivated(tileIds: readonly string[]): void {
    const cultivated = new Set(tileIds);
    for (const [id, sprites] of this.details) {
      for (const sprite of sprites) sprite.setVisible(!cultivated.has(id));
    }
  }

  applySeason(season: Season): void {
    for (const image of this.images) image.setTint(TINT[season]);
  }
}
