import { describe, expect, it } from "vitest";
import { CROPS } from "../src/data/crops";
import { IntroQuestService, getIntroQuestCrop } from "../src/domain/services/IntroQuestService";
import type { IntroQuestState } from "../src/domain/models/types";

describe("locked introductory crop goal", () => {
  it.each([
    ["spring", "dew_radish"], ["summer", "ember_tomato"],
    ["autumn", "leaf_cabbage"], ["winter", "ice_grass"],
  ] as const)("selects a basic valid %s crop without changing crop definitions", (season, cropId) => {
    const before = JSON.stringify(CROPS);
    const service = new IntroQuestService();
    expect(getIntroQuestCrop(season)?.id).toBe(cropId);
    expect(service.accept(season)).toEqual({ ok: true, value: { cropId, seedItemId: `${cropId}_seed` } });
    expect(service.state).toEqual({ status: "active", cropId });
    expect(JSON.stringify(CROPS)).toBe(before);
  });
  it("locks the accepted crop through season changes and rejects duplicate transitions", () => {
    const service = new IntroQuestService();
    expect(service.complete()).toEqual({ ok: false, reason: "QUEST_NOT_ACTIVE" });
    service.accept("spring");
    expect(service.accept("summer")).toEqual({ ok: false, reason: "QUEST_ALREADY_ACCEPTED" });
    expect(service.state.cropId).toBe("dew_radish");
    expect(service.complete().ok).toBe(true);
    expect(service.state).toEqual({ status: "completed", cropId: "dew_radish" });
    expect(service.complete().ok).toBe(false); expect(service.accept("spring").ok).toBe(false);
  });
  it("clones state and safely restores or clears it", () => {
    const service = new IntroQuestService(); service.accept("autumn");
    const state = service.state; state.cropId = "starberry";
    const copy = service.serialize(); copy.status = "completed";
    expect(service.state).toEqual({ status: "active", cropId: "leaf_cabbage" });
    const restored = new IntroQuestService(); restored.restore(service.serialize());
    expect(restored.state).toEqual(service.state);
    const invalid = [
      { status: "available", cropId: "dew_radish" }, { status: "active", cropId: null },
      { status: "completed", cropId: "unknown" }, { status: "unknown", cropId: null },
    ];
    for (const state of invalid) {
      expect(() => restored.restore(state as IntroQuestState)).toThrow(RangeError);
      expect(restored.state).toEqual(service.state);
    }
    restored.newGame(); expect(restored.state).toEqual({ status: "available", cropId: null });
  });
});
