import Phaser from "phaser";
import type { ParsedMap } from "../../data/maps/farm01.types";
import { areaExits, arrivalFrom, exitAt, type AreaId, type AreaExit } from "../../data/maps/areaConnections";
import { getFarmAudio } from "./farmAudio";
import { FarmEnvironment } from "./farmEnvironment";

const TILE = 32;
const NAMES: Record<AreaId, string> = { farm: "林缘农场", forest: "林缘森林", town: "溪桥镇" };

/** World paths and automatic edge crossings. Owns no inventory, date or save schema. */
export class AreaPassage {
  private readonly paths = new Map<string, Phaser.GameObjects.Image>();
  private readonly signs: Phaser.GameObjects.GameObject[] = [];
  private blockedUntil: number;
  private transitioning = false;
  private fadeHandler?: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly area: AreaId,
    private readonly world: ParsedMap,
    private readonly player: Phaser.Physics.Arcade.Sprite,
    private readonly save: () => boolean,
    private readonly freeze: () => void,
    private readonly failed: () => void,
    reservedIds: readonly string[] = [],
  ) {
    this.blockedUntil = scene.time.now + 350;
    this.renderPaths(new Set(reservedIds));
    this.renderSigns();
    const camera = scene.cameras.main;
    camera.resetFX(); camera.centerOn(player.x, player.y); camera.fadeIn(160, 0, 0, 0);
  }

  private renderPaths(reserved: ReadonlySet<string>): void {
    if (!this.scene.textures.exists("farm-home-path")) return;
    const cells = new Map<string, { row: number; col: number }>();
    const existing = new Set((this.world as ParsedMap & { paths?: { row: number; col: number }[] }).paths?.map(p => `${p.row}_${p.col}`));
    for (const exit of areaExits(this.area)) {
      for (let row = exit.row; row < exit.row + 2; row++) {
        const columns = this.area === "farm" ? this.world.width : 5;
        for (let step = 0; step < columns; step++) {
          const col = this.area === "farm" || exit.edge === "left" ? step : this.world.width - 1 - step;
          const id = `${row}_${col}`, tile = this.world.tiles[row]?.[col];
          if (!tile || tile.solid || tile.key !== "grass") continue;
          if (reserved.has(id) && col > 0 && col < this.world.width - 1) continue;
          cells.set(id, { row, col });
        }
      }
    }
    for (const [id, { row, col }] of cells) {
      const west = cells.has(`${row}_${col - 1}`) || existing.has(`${row}_${col - 1}`);
      const east = cells.has(`${row}_${col + 1}`) || existing.has(`${row}_${col + 1}`);
      const north = cells.has(`${row - 1}_${col}`);
      const frame = north ? !west ? "sw" : !east ? "se" : "s" : !west ? "nw" : !east ? "ne" : "n";
      this.paths.set(id, this.scene.add.image(col * TILE, row * TILE, "farm-home-path", frame)
        .setOrigin(0).setDisplaySize(TILE, TILE).setDepth(1));
    }
  }

  private renderSigns(): void {
    for (const exit of areaExits(this.area)) {
      const x = exit.edge === "left" ? 112 : this.world.width * TILE - 112;
      const y = (exit.row + 2) * TILE + 20;
      const frame = `TX Props Road Sign ${exit.edge === "left" ? "W" : "E"}`;
      if (this.scene.textures.exists("TX Props") && this.scene.textures.get("TX Props").has(frame)) {
        const image = this.scene.add.image(x, y, "TX Props", frame).setOrigin(0.5, 1);
        image.setDepth(FarmEnvironment.objectDepth(y)); this.signs.push(image);
      }
      this.signs.push(this.scene.add.text(x, y + 5,
        `${exit.edge === "left" ? "← " : ""}${NAMES[exit.destination]}${exit.edge === "right" ? " →" : ""}`,
        { fontFamily: "monospace", fontSize: "11px", color: "#f3dfac", backgroundColor: "#382f20dd", padding: { x: 4, y: 3 } })
        .setOrigin(0.5, 0).setDepth(12));
    }
  }

  syncCultivated(ids: readonly string[]): void {
    const cultivated = new Set(ids);
    for (const [id, image] of this.paths) image.setVisible(!cultivated.has(id));
  }

  hint(): string | null {
    const exit = areaExits(this.area).find(e => Math.abs(this.player.y - (e.row + 1) * TILE) < 96
      && (e.edge === "left" ? this.player.x < 200 : this.player.x > this.world.width * TILE - 200));
    return exit ? `沿${exit.edge === "left" ? "西" : "东"}侧小路继续走 · 前往${NAMES[exit.destination]}` : null;
  }

  update(): void {
    if (this.transitioning || this.scene.time.now < this.blockedUntil) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const exit = exitAt(this.area, this.world.width, this.player.x, this.player.y, body.velocity.x);
    if (exit) this.cross(exit);
  }

  private cross(exit: AreaExit): void {
    if (!this.save()) {
      const safe = arrivalFrom(this.area, exit.destination, this.world.width);
      if (safe) this.player.body!.reset(safe.x, safe.y);
      this.player.setVelocity(0, 0); this.blockedUntil = this.scene.time.now + 900;
      getFarmAudio().play("error"); this.failed(); return;
    }
    this.transitioning = true; this.freeze(); this.player.setVelocity(0, 0);
    this.scene.input.enabled = false;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = false; }
    const audio = getFarmAudio(); audio.setPaused(true); audio.play("door");
    this.fadeHandler = () => { this.fadeHandler = undefined; this.scene.scene.start(exit.destination, { fromArea: this.area }); };
    this.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, this.fadeHandler);
    this.scene.cameras.main.fadeOut(180, 0, 0, 0);
  }

  destroy(): void {
    if (this.fadeHandler) this.scene.cameras.main.off(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, this.fadeHandler);
    this.fadeHandler = undefined;
    for (const image of this.paths.values()) image.destroy(); this.paths.clear();
    for (const sign of this.signs) sign.destroy(); this.signs.length = 0;
  }
}
