import Phaser from "phaser";
import type { ParsedMap, TileDef } from "../../data/maps/farm01.types";
import type { Season } from "../../domain/models/types";
import { TILE } from "../config";
import { planFarmWater, type WaterCell } from "./farmWaterPlan";

const POND = "farm-water-original";
const PROPS = "TX Props";
const WATER_TINT: Record<Season, number> = {
  spring: 0xffffff, summer: 0xdde9d8, autumn: 0xe8dbcf, winter: 0xcbdfe6,
};
const BANK_TINT: Record<Season, number> = {
  spring: 0xffffff, summer: 0xf5efcc, autumn: 0xe5b781, winter: 0xc8d6df,
};

/** Original pond crops are display-only; the scene retains all original water bodies. */
export class FarmWater {
  private readonly water: Phaser.GameObjects.Image[] = [];
  private readonly banks: Phaser.GameObjects.Image[] = [];
  private readonly glints: Phaser.GameObjects.Image[] = [];
  private readonly cells = new Map<string, WaterCell>();
  private timer?: Phaser.Time.TimerEvent;
  private readonly ready: boolean;
  private phase = false;
  private planWidth = 0;
  private planHeight = 0;

  static preload(scene: Phaser.Scene): void {
    const base = import.meta.env.BASE_URL;
    if (!scene.textures.exists(POND)) {
      scene.load.image(POND, `${base}farm-assets/original-addons/v1/pond-v1.png`);
    }
  }

  constructor(private readonly scene: Phaser.Scene, world: ParsedMap) {
    this.ready = scene.textures.exists(POND) && scene.textures.exists(PROPS);
    if (!this.ready) return;
    const texture = scene.textures.get(POND);
    // Measured opaque water interior; use one continuous region across the entire pond.
    // Frames refer to the untouched 1254x1254 original, not a generated tiled PNG.
    const plan = planFarmWater(world);
    this.planWidth = plan.width;
    this.planHeight = plan.height;
    for (const cell of plan.cells) {
      const name = `water-${plan.width}-${plan.height}-${cell.sourceCol}-${cell.sourceRow}`;
      const x0 = 350 + Math.round(cell.sourceCol * 550 / plan.width);
      const y0 = 405 + Math.round(cell.sourceRow * 350 / plan.height);
      const x1 = 350 + Math.round((cell.sourceCol + 1) * 550 / plan.width);
      const y1 = 405 + Math.round((cell.sourceRow + 1) * 350 / plan.height);
      if (!texture.has(name)) texture.add(name, 0, x0, y0, x1 - x0, y1 - y0);
      this.cells.set(`${cell.row}_${cell.col}`, cell);
    }
    if (!texture.has("glint")) texture.add("glint", 0, 704, 669, 114, 28);
  }

  render(tile: TileDef, row: number, col: number): boolean {
    if (!this.ready || tile.key !== "water") return false;
    const cell = this.cells.get(`${row}_${col}`);
    if (!cell) return false;
    const x = col * TILE, y = row * TILE;
    this.water.push(this.scene.add.image(x, y, POND,
      `water-${this.planWidth}-${this.planHeight}-${cell.sourceCol}-${cell.sourceRow}`)
      .setOrigin(0).setDisplaySize(TILE, TILE).setDepth(0.6));
    for (const side of cell.edges) {
      const horizontal = side === "north" || side === "south";
      for (let i = 0; i < 4; i++) {
        const size = 8 + (row * 3 + col + i) % 3;
        const along = Math.max(size / 2, Math.min(TILE - size / 2, 4 + i * 8));
        const across = side === "south" || side === "east" ? TILE - size / 2 : size / 2;
        const frames = ["TX Props - Stone 01", "TX Props - Stone 03", "TX Props - Stone 05", "TX Props - Stone 06"];
        this.banks.push(this.scene.add.image(x + (horizontal ? along : across),
          y + (horizontal ? across : along), PROPS, frames[(row + col + i) % frames.length])
          .setDisplaySize(size, size).setDepth(1.2));
      }
      // The shoreline occupies only the blocked tile; neighboring grass stays playable.
    }
    if ((row * 7 + col) % 3 === 0) {
      this.glints.push(this.scene.add.image(x + 18, y + 18, POND, "glint")
        .setDisplaySize(12, 3).setAlpha(0.16).setDepth(1));
    }
    if (!this.timer) this.timer = this.scene.time.addEvent({
      delay: 900, loop: true, callback: () => {
        this.phase = !this.phase;
        this.glints.forEach((image, i) => image.setAlpha((this.phase !== (i % 2 === 0)) ? 0.18 : 0.04));
      },
    });
    return true;
  }

  applySeason(season: Season): void {
    for (const image of [...this.water, ...this.glints]) image.setTint(WATER_TINT[season]);
    for (const image of this.banks) image.setTint(BANK_TINT[season]);
  }

  destroy(): void {
    this.timer?.destroy();
    this.timer = undefined;
    for (const image of [...this.water, ...this.banks, ...this.glints]) image.destroy();
    this.water.length = this.banks.length = this.glints.length = 0;
    this.cells.clear();
  }
}
