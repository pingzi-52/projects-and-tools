import type Phaser from "phaser";
import type { Facing } from "../utils/targetTile";

export const FARMER_TEXTURE = "farm-farmer-v1";
export type FarmerAction = "hoe" | "water" | "plant" | "harvest";
const FACINGS: readonly Facing[] = ["down", "left", "right", "up"];
const STEPS = ["walk1", "walk2", "idle"] as const;
export const FARMER_FRAMES = FACINGS.flatMap(facing => [
  `${facing}_idle`, `${facing}_walk1`, `${facing}_walk2`,
]);

/** Pure visual timing. Idle never depends on the last walk frame. */
export function selectFarmerFrame(facing: Facing, moving: boolean, elapsed: number): string {
  if (!moving) return `${facing}_idle`;
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return `${facing}_${STEPS[Math.floor(safeElapsed / 180) % STEPS.length]}`;
}

/** Require a complete directional atlas before hiding the original physical sprite. */
export function hasFarmerFrames(hasFrame: (name: string) => boolean): boolean {
  return FARMER_FRAMES.every(hasFrame);
}

/** Display-only companion: no Arcade body, input registration or game state. */
export class FarmerVisual {
  readonly enabled: boolean;
  private image?: Phaser.GameObjects.Image;
  private elapsed = 0;
  private walking = false;
  private readonly pose = { x: 0, y: 0, angle: 0 };

  constructor(private readonly scene: Phaser.Scene, x: number, feetY: number) {
    this.enabled = scene.textures.exists(FARMER_TEXTURE)
      && hasFarmerFrames(name => scene.textures.get(FARMER_TEXTURE).has(name));
    if (!this.enabled) return;
    this.image = scene.add.image(x, feetY, FARMER_TEXTURE, "down_idle")
      .setOrigin(0.5, 1).setDisplaySize(32, 40).setDepth(10 + feetY / 10000);
  }

  update(facing: Facing, moving: boolean, delta: number): void {
    if (!this.image) return;
    if (!moving || !this.walking) this.elapsed = 0;
    const frame = selectFarmerFrame(facing, moving, this.elapsed);
    if (this.image.frame.name !== frame) {
      // Atlas crops may differ in native dimensions; keep a stable feet anchor and display box.
      this.image.setFrame(frame).setDisplaySize(32, 40);
    }
    if (moving && Number.isFinite(delta)) this.elapsed = (this.elapsed + Math.max(0, delta)) % 540;
    this.walking = moving;
  }

  /** Called after ArcadePhysics has copied its final body position to the proxy sprite. */
  syncPosition(x: number, feetY: number): void {
    this.image?.setPosition(x + this.pose.x, feetY + this.pose.y)
      .setAngle(this.pose.angle).setDepth(10 + feetY / 10000);
  }

  playAction(action: FarmerAction): void {
    if (!this.image) return;
    this.scene.tweens.killTweensOf(this.pose);
    Object.assign(this.pose, { x: 0, y: 0, angle: 0 });
    const motion = {
      hoe: { x: 0, y: -3, angle: -7, duration: 100 },
      water: { x: 1, y: -1, angle: 4, duration: 140 },
      plant: { x: 0, y: 2, angle: 0, duration: 110 },
      harvest: { x: 0, y: -4, angle: 0, duration: 120 },
    }[action];
    this.scene.tweens.add({
      targets: this.pose, ...motion, ease: "Sine.easeInOut", yoyo: true,
      onComplete: () => Object.assign(this.pose, { x: 0, y: 0, angle: 0 }),
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.pose);
    this.image?.destroy();
    this.image = undefined;
    this.elapsed = 0;
    this.walking = false;
  }
}
