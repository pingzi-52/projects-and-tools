import type { FishingEscapeReason, FishingState } from "../domain/services/FishingRound";
import type { AudioCue } from "../game/systems/farmAudio";

export interface FishingFeedbackEvent {
  kind: "bite" | "hook" | "good" | "miss" | "caught" | "escaped";
  message: string;
  cue: AudioCue;
}

/** Discrete feedback only: frame-by-frame cursor/countdown movement emits nothing. */
export class FishingFeedback {
  private previous?: FishingState;
  private event: FishingFeedbackEvent | null = null;
  private remainingMs = 0;
  private paused = false;

  get current(): FishingFeedbackEvent | null { return this.event ? { ...this.event } : null; }
  get pulse(): number { return this.event ? Math.max(0, (this.remainingMs - 600) / 300) : 0; }

  reset(): void { this.previous = undefined; this.event = null; this.remainingMs = 0; this.paused = false; }

  update(delta: number, paused = false): void {
    if (paused) { this.paused = true; return; }
    if (this.paused) { this.paused = false; return; }
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.remainingMs = Math.max(0, this.remainingMs - Math.min(100, delta));
    if (this.remainingMs === 0) this.event = null;
  }

  observe(state: FishingState): FishingFeedbackEvent | null {
    const previous = this.previous;
    this.previous = { ...state };
    if (!previous || state.phase === "idle" || state.phase === "waiting") {
      this.event = null; this.remainingMs = 0; return null;
    }
    let next: FishingFeedbackEvent | null = null;
    if (state.phase !== previous.phase) {
      this.event = null; this.remainingMs = 0;
      if (state.phase === "bite") next = { kind: "bite", message: "浮标下沉了，快提竿！", cue: "fish_bite" };
      if (state.phase === "reeling") next = { kind: "hook", message: "上钩了！等指针进入绿区再收线。", cue: "fish_reel" };
      if (state.phase === "caught") next = { kind: "caught", message: "稳稳收住了！按“收好鱼获”放入背包。", cue: "fish_catch" };
      if (state.phase === "escaped") next = { kind: "escaped", message: fishingEscapeHelp(state.escapeReason), cue: "error" };
    } else if (state.phase === "reeling") {
      if (state.progress > previous.progress) next = { kind: "good", message: `收线稳了！完成 ${state.progress}/3。`, cue: "fish_reel" };
      else if (state.misses > previous.misses) next = { kind: "miss", message: `鱼线晃了一下，再失误 ${5 - state.misses} 次鱼会逃脱。`, cue: "error" };
    }
    if (next) { this.event = next; this.remainingMs = 900; }
    return next;
  }
}

export function fishingEscapeHelp(reason?: FishingEscapeReason): string {
  const help = {
    early_pull: "收竿太早了。等浮标下沉、出现咬钩提示再提竿。",
    missed_bite: "错过咬钩了。浮标下沉后要在2.5秒内提竿。",
    bad_reels: "绿区外收线达到5次。下次等指针进入绿区再按。",
    reel_timeout: "收线时间用完了。20秒内完成3次绿区收线即可。",
  };
  return `${reason ? help[reason] : "这次鱼线松开了，可以重新下竿。"}没有扣除体力。`;
}

export function fishingCountdown(state: FishingState): string {
  if (state.phase !== "bite" && state.phase !== "reeling") return "";
  return `${state.phase === "bite" ? "提竿" : "收线"}剩余 ${Math.ceil(state.remainingMs / 1000)} 秒`;
}
