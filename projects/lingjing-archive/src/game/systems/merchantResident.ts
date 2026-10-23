import type Phaser from "phaser";
import { FarmEnvironment } from "./farmEnvironment";
import type { MerchantPlot } from "./merchantPlot";
import { ResidentMarker } from "./residentMarker";
import { ResidentMotion } from "./residentMotion";

export type MerchantQuestStatus = "available" | "active" | "ready" | "completed";

/** Static resident: an explicit body for the scene collider, no game-state mutation. */
export class MerchantResident {
  readonly body: Phaser.Physics.Arcade.Image;
  private readonly image: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly marker: ResidentMarker;
  private readonly motion: ResidentMotion;
  private destroyed = false;

  constructor(scene: Phaser.Scene, private readonly plot: MerchantPlot) {
    this.body = scene.physics.add.staticImage(plot.x, plot.y, "player_0")
      .setDisplaySize(32, 28).setVisible(false);
    this.body.refreshBody();
    const art = scene.textures.exists("farm-merchant-v1") && scene.textures.get("farm-merchant-v1").has("trimmed");
    const depth = FarmEnvironment.objectDepth(plot.y + 16);
    this.image = scene.add.image(plot.x, plot.y + 16, art ? "farm-merchant-v1" : "player_0", art ? "trimmed" : undefined)
      .setOrigin(0.5, 1).setDepth(depth);
    // Preserve the source silhouette; independent width/height scaling flattened the tall original.
    if (art) this.image.setScale(44 / this.image.frame.realHeight);
    this.motion = new ResidentMotion(scene, this.image, "merchant");
    const labelY = this.image.y - this.image.displayHeight - 4;
    this.label = scene.add.text(plot.x, labelY, "禾木 · 杂货商", {
      fontFamily: "monospace", fontSize: "10px", color: "#f2dfaa", backgroundColor: "#302e1ccc",
    }).setOrigin(0.5, 1).setDepth(depth + 0.001);
    this.marker = new ResidentMarker(scene, plot.x, labelY - 16);
  }

  near(x: number, y: number): boolean {
    return !this.destroyed && Number.isFinite(x) && Number.isFinite(y)
      && Math.hypot(x - this.plot.x, y - this.plot.y) <= 64;
  }

  update(playerX: number, playerY: number, questStatus: MerchantQuestStatus, delta = 0): void {
    if (this.destroyed) return;
    this.marker.update(questStatus, this.near(playerX, playerY), true);
    this.motion.update(delta, this.near(playerX, playerY), false);
  }

  hideGuidance(): void { this.marker.hide(); this.motion.update(0, false, true); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.motion.destroy(); this.body.destroy(); this.image.destroy(); this.label.destroy(); this.marker.destroy();
  }
}
