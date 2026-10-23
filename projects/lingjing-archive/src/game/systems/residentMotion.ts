import type Phaser from "phaser";

export type ResidentKind = "merchant" | "guide" | "carpenter";
export type ResidentPose = "idle" | "blink" | "greet";

const ATLAS = "farm-residents-motion-v1";
const FIRST_BLINK: Record<ResidentKind, number> = { merchant: 4200, guide: 4900, carpenter: 5600 };
const BLINK_INTERVAL = 4800;
const BLINK_DURATION = 160;
const GREETING_DURATION = 650;

/** A small active-time clock; no timers, scene ownership or persistence. */
export class ResidentMotionClock {
  private elapsed = 0;
  private nextBlink: number;
  private blinkUntil = 0;
  private greetingUntil = 0;
  private wasNear = false;
  private wasPaused = false;
  private destroyed = false;
  private pose: ResidentPose = "idle";

  constructor(kind: ResidentKind) { this.nextBlink = FIRST_BLINK[kind]; }

  update(delta: number, near: boolean, paused: boolean): ResidentPose {
    if (this.destroyed) return this.pose;
    if (paused) { this.wasPaused = true; return this.pose; }
    const elapsed = this.wasPaused || !Number.isFinite(delta) ? 0 : Math.max(0, Math.min(100, delta));
    this.wasPaused = false;
    this.elapsed += elapsed;
    if (near && !this.wasNear) this.greetingUntil = this.elapsed + GREETING_DURATION;
    this.wasNear = near;
    if (this.elapsed >= this.nextBlink) {
      this.nextBlink = this.elapsed + BLINK_INTERVAL;
      // A greeting takes priority; do not queue up an overdue blink afterwards.
      if (this.elapsed >= this.greetingUntil) this.blinkUntil = this.elapsed + BLINK_DURATION;
    }
    this.pose = this.elapsed < this.greetingUntil ? "greet" : this.elapsed < this.blinkUntil ? "blink" : "idle";
    return this.pose;
  }

  destroy(): void { this.destroyed = true; }
}

/** Changes only the supplied image's atlas frame and its single uniform scale. */
export class ResidentMotion {
  private readonly clock: ResidentMotionClock;
  private ready = false;
  private destroyed = false;
  private pose: ResidentPose = "idle";

  constructor(scene: Phaser.Scene, private readonly image: Phaser.GameObjects.Image, private readonly kind: ResidentKind) {
    this.clock = new ResidentMotionClock(kind);
    if (!scene.textures.exists(ATLAS)) return;
    const atlas = scene.textures.get(ATLAS);
    const names = (["idle", "blink", "greet"] as const).map(pose => `${kind}_${pose}`);
    if (!names.every(name => atlas.has(name))) return;
    const frames = names.map(name => atlas.get(name));
    const sourceWidth = frames[0].realWidth, sourceHeight = frames[0].realHeight;
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0
      || !frames.every(frame => frame.realWidth === sourceWidth && frame.realHeight === sourceHeight)) return;
    image.setTexture(ATLAS, `${kind}_idle`);
    image.setScale(44 / sourceHeight);
    this.ready = true;
  }

  update(delta: number, near: boolean, paused: boolean): void {
    if (!this.ready || this.destroyed) return;
    const pose = this.clock.update(delta, near, paused);
    if (pose === this.pose) return;
    this.pose = pose;
    this.image.setFrame(`${this.kind}_${pose}`);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clock.destroy();
  }
}
