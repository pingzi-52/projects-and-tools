import { CROPS } from "../../data/crops";
import type { CropDefinition } from "../models/Crop";
import type { Result } from "../models/Result";
import type { IntroQuestState, Season } from "../models/types";

export const INTRO_QUEST_SEEDS = 3;
export const INTRO_QUEST_REWARD = 120;

/** Shortest first harvest, then cheapest seed; no changes to the global crop list. */
export function getIntroQuestCrop(season: Season): CropDefinition | undefined {
  return CROPS.filter(crop => crop.seasons.includes(season))
    .sort((a, b) => a.growDays - b.growDays || a.seedPrice - b.seedPrice)[0];
}

/** Only the session exchanges items/gold and persists; this service owns the locked goal. */
export class IntroQuestService {
  private current: IntroQuestState = { status: "available", cropId: null };
  get state(): IntroQuestState { return { ...this.current }; }
  serialize(): IntroQuestState { return this.state; }

  restore(state: IntroQuestState): void {
    if (!state || !["available", "active", "completed"].includes(state.status)
      || (state.status === "available" ? state.cropId !== null : !CROPS.some(crop => crop.id === state.cropId))) {
      throw new RangeError("Invalid introduction quest state");
    }
    this.current = state.status === "available" ? { status: "available", cropId: null }
      : { status: state.status, cropId: state.cropId };
  }
  newGame(): void { this.current = { status: "available", cropId: null }; }

  accept(season: Season): Result<{ cropId: string; seedItemId: string }> {
    if (this.current.status !== "available") return { ok: false, reason: "QUEST_ALREADY_ACCEPTED" };
    const crop = getIntroQuestCrop(season);
    if (!crop) return { ok: false, reason: "NO_SEASON_CROP" };
    this.current = { status: "active", cropId: crop.id };
    return { ok: true, value: { cropId: crop.id, seedItemId: crop.seedItemId } };
  }
  complete(): Result {
    if (this.current.status !== "active") return { ok: false, reason: "QUEST_NOT_ACTIVE" };
    this.current = { status: "completed", cropId: this.current.cropId };
    return { ok: true, value: undefined };
  }
}
