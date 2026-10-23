import type { Result } from "../models/Result";
import type { FishingQuestState } from "../models/types";

/** Durable milestone only; inventory, rewards and persistence belong to the session. */
export class FishingQuestService {
  private current: FishingQuestState = { status: "available" };
  get state(): FishingQuestState { return { ...this.current }; }
  serialize(): FishingQuestState { return this.state; }
  restore(state: FishingQuestState): void {
    if (!state || typeof state !== "object" || Array.isArray(state) || Object.keys(state).length !== 1
      || !Object.prototype.hasOwnProperty.call(state, "status") || !["available", "active", "completed"].includes(state.status)) throw new RangeError("Invalid fishing quest state");
    this.current = { status: state.status };
  }
  newGame(): void { this.current = { status: "available" }; }
  accept(): Result {
    if (this.current.status !== "available") return { ok: false, reason: "QUEST_ALREADY_ACCEPTED" };
    this.current = { status: "active" }; return { ok: true, value: undefined };
  }
  complete(): Result {
    if (this.current.status !== "active") return { ok: false, reason: "QUEST_NOT_ACTIVE" };
    this.current = { status: "completed" }; return { ok: true, value: undefined };
  }
}
