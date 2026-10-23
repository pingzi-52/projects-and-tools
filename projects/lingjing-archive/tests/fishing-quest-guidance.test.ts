import { describe, expect, it } from "vitest";
import { initGameSession } from "../src/game/systems/GameSession";
import { getFishingQuestGuidance } from "../src/ui/fishingQuestGuidance";

describe("fishing quest directions", () => {
  it("shows an explicit one-off offer before accepting", () => {
    const q = getFishingQuestGuidance(initGameSession());
    expect(q.status).toBe("available");
    expect(q.nextStep).toContain("接取");
    expect(q.reward).toBe(60);
    expect(q.choices).toEqual([]);
  });
  it("counts only backpack fish and permits a choice between species", () => {
    const s = initGameSession();s.acceptFishingQuest();s.chest.add("sun_carp",2);
    expect(getFishingQuestGuidance(s).status).toBe("active");
    s.inventory.add("silver_crucian",1);s.inventory.add("sun_carp",3);
    const q = getFishingQuestGuidance(s);
    expect(q.status).toBe("ready");
    expect(q.choices.map(f => [f.id,f.have])).toEqual([["silver_crucian",1],["sun_carp",3]]);
    expect(q.nextStep).toContain("选择");
  });
  it("keeps completion durable even after another fish is acquired", () => {
    const s=initGameSession();s.acceptFishingQuest();s.inventory.add("sun_carp",1);s.completeFishingQuest("sun_carp");s.inventory.add("silver_crucian",1);
    expect(getFishingQuestGuidance(s)).toMatchObject({status:"completed",choices:[]});
  });
});
