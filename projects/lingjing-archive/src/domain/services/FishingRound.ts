import type { FishId } from "../../data/fishing";

export type FishingPhase = "idle" | "waiting" | "bite" | "reeling" | "caught" | "escaped";
export type FishingEscapeReason = "early_pull" | "missed_bite" | "bad_reels" | "reel_timeout";

export interface FishingState {
  phase: FishingPhase;
  remainingMs: number;
  cursor: number;
  inZone: boolean;
  progress: number;
  misses: number;
  fishId: FishId | null;
  escapeReason?: FishingEscapeReason;
}

const BITE_WINDOW_MS = 2500;
const REEL_WINDOW_MS = 20000;
const CURSOR_PERIOD_MS = 1800;
const TAP_COOLDOWN_MS = 250;

function idleState(): FishingState {
  return { phase: "idle", remainingMs: 0, cursor: 0, inZone: false, progress: 0, misses: 0, fishId: null };
}

/** A single fishing attempt. Time comes only from active foreground frames. */
export class FishingRound {
  private current = idleState();
  private selectedFish: FishId | null = null;
  private reelElapsedMs = 0;
  private cooldownMs = 0;
  private paused = false;

  constructor(private readonly random: () => number = Math.random) {}

  get state(): FishingState {
    return { ...this.current };
  }

  cast(): boolean {
    if (this.current.phase !== "idle" && this.current.phase !== "escaped") return false;
    this.cancel();
    // Keep selection private until landed; one cast always consumes two samples.
    const waitMs = 3000 + this.sample() * 2000;
    this.selectedFish = this.sample() < 0.65 ? "silver_crucian" : "sun_carp";
    this.current.phase = "waiting";
    this.current.remainingMs = waitMs;
    return true;
  }

  update(delta: number, paused = false): void {
    if (paused) {
      this.paused = true;
      return;
    }
    if (this.paused) {
      this.paused = false;
      return;
    }
    if (!Number.isFinite(delta) || delta <= 0) return;
    let frameMs = Math.min(100, delta);

    // Carry the small frame remainder into the next timed phase, never offline time.
    while (frameMs > 0) {
      const phase = this.current.phase;
      if (phase !== "waiting" && phase !== "bite" && phase !== "reeling") return;
      const step = Math.min(frameMs, this.current.remainingMs);
      this.current.remainingMs = Math.max(0, this.current.remainingMs - step);
      frameMs -= step;

      if (phase === "reeling") {
        this.reelElapsedMs += step;
        this.cooldownMs = Math.max(0, this.cooldownMs - step);
        const position = (this.reelElapsedMs % CURSOR_PERIOD_MS) / (CURSOR_PERIOD_MS / 2);
        this.current.cursor = position <= 1 ? position : 2 - position;
        this.current.inZone = this.current.cursor >= 0.22 && this.current.cursor <= 0.78;
      }

      if (this.current.remainingMs > 0) return;
      if (phase === "waiting") {
        this.current.phase = "bite";
        this.current.remainingMs = BITE_WINDOW_MS;
      } else {
        this.finish("escaped", phase === "bite" ? "missed_bite" : "reel_timeout");
        return;
      }
    }
  }

  tap(): void {
    if (this.paused) return;
    if (this.current.phase === "waiting") {
      this.finish("escaped", "early_pull");
      return;
    }
    if (this.current.phase === "bite") {
      this.current.phase = "reeling";
      this.current.remainingMs = REEL_WINDOW_MS;
      this.cooldownMs = TAP_COOLDOWN_MS;
      return;
    }
    if (this.current.phase !== "reeling" || this.cooldownMs > 0) return;
    this.cooldownMs = TAP_COOLDOWN_MS;
    if (this.current.inZone) {
      this.current.progress += 1;
      if (this.current.progress >= 3) this.finish("caught");
    } else {
      this.current.misses += 1;
      if (this.current.misses >= 5) this.finish("escaped", "bad_reels");
    }
  }

  consumeCatch(): FishId | null {
    if (this.current.phase !== "caught") return null;
    const fish = this.current.fishId;
    this.cancel();
    return fish;
  }

  cancel(): void {
    this.current = idleState();
    this.selectedFish = null;
    this.reelElapsedMs = 0;
    this.cooldownMs = 0;
    this.paused = false;
  }

  private finish(phase: "caught" | "escaped", reason?: FishingEscapeReason): void {
    this.current.phase = phase;
    this.current.remainingMs = 0;
    this.current.inZone = false;
    this.current.fishId = phase === "caught" ? this.selectedFish : null;
    if (reason) this.current.escapeReason = reason;
  }

  private sample(): number {
    const value = this.random();
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.5;
  }
}
