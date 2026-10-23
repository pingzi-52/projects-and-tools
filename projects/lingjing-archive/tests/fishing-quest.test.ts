import { describe, expect, it } from "vitest";
import { FishingQuestService } from "../src/domain/services/FishingQuestService";
import { FISHING_QUEST } from "../src/data/fishingQuest";

describe("once-only pond request state", () => {
  it("starts available, accepts once and completes only once", () => {
    const q = new FishingQuestService();
    expect(FISHING_QUEST.reward).toBe(60);
    expect(q.state).toEqual({ status: "available" });
    expect(q.complete()).toEqual({ ok: false, reason: "QUEST_NOT_ACTIVE" });
    expect(q.accept().ok).toBe(true);
    expect(q.accept()).toEqual({ ok: false, reason: "QUEST_ALREADY_ACCEPTED" });
    expect(q.complete().ok).toBe(true);
    expect(q.complete()).toEqual({ ok: false, reason: "QUEST_NOT_ACTIVE" });
    expect(q.accept().ok).toBe(false);
    const state = q.state; state.status = "available";
    expect(q.serialize()).toEqual({ status: "completed" });
    q.newGame(); expect(q.state.status).toBe("available");
  });
  it.each([null, [], {}, "active", { status: "wrong" }, { status: "active", reward: 60 }])("rejects invalid restore %#", invalid => {
    const q = new FishingQuestService(); q.accept();
    expect(() => q.restore(invalid as any)).toThrow();
    expect(q.state.status).toBe("active");
  });
});
