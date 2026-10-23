import { describe, expect, it } from "vitest";
import { getQuestGuidance } from "../src/ui/questGuidance";
import { initGameSession, type GameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager } from "../src/persistence/save";
import { SAVE_KEY } from "../src/domain/models/types";
import type { AreaId } from "../src/data/maps/areaConnections";

function fresh(storage = new MemoryStorage()) {
  const session = initGameSession(new SaveManager(storage));
  session.newGame();
  return session;
}

function snapshot(s: GameSession) {
  return {
    introQuest: s.introQuest.serialize(), exploration: s.exploration.serialize(),
    inventory: s.inventory.serialize(), chest: s.chest.serialize(),
    farming: s.farming.serialize(), daily: s.life.serialize(),
    day: s.time.date.day, gold: s.economy.goldValue,
  };
}

describe("shared quest guidance snapshots", () => {
  it.each([
    ["farm", "禾木"], ["forest", "岚"], ["town", "阿榆"],
  ] as const)("directs a new %s request to its own resident", (area, resident) => {
    const s = fresh(), guidance = getQuestGuidance(s, area);
    expect(guidance.area).toBe(area);
    expect(guidance.resident).toBe(resident);
    expect(guidance.status).toBe("available");
    expect(guidance.title.length).toBeGreaterThan(0);
    expect(guidance.nextStep).toContain(resident);
    expect(guidance.nextStep).toContain("接取");
    expect(guidance.nextStep).toContain("E");
    expect(guidance.progress).not.toMatch(/[\r\n]/);
  });

  it("does not invent a seasonal crop before the merchant request is accepted", () => {
    const s = fresh();
    s.inventory.add("dew_radish", 5);
    expect(getQuestGuidance(s, "farm")).toMatchObject({ status: "available", requirements: [] });
    s.time.setDay(15);
    expect(getQuestGuidance(s, "farm")).toMatchObject({ status: "available", requirements: [] });
  });

  it("uses the accepted crop, excluding its seeds and chest stock from delivery", () => {
    const s = fresh();
    expect(s.acceptIntroQuest().ok).toBe(true);
    s.chest.add("dew_radish", 3);
    s.inventory.add("starberry", 2);
    const guidance = getQuestGuidance(s, "farm");
    expect(guidance.status).toBe("active");
    expect(guidance.requirements).toEqual([{ itemId: "dew_radish", name: "青露萝卜", have: 0, need: 1 }]);
    expect(guidance.progress).toBe("青露萝卜 0/1");
    expect(guidance.nextStep).toMatch(/照料|收获/);
    expect(s.inventory.count("dew_radish_seed")).toBe(3);
  });

  it("tracks the locked spring crop after summer begins and updates from current inventory", () => {
    const s = fresh();
    s.acceptIntroQuest();
    s.time.setDay(15);
    s.inventory.add("ember_tomato", 2);
    expect(getQuestGuidance(s, "farm").status).toBe("active");
    s.inventory.add("dew_radish", 3);
    const ready = getQuestGuidance(s, "farm");
    expect(ready.status).toBe("ready");
    expect(ready.progress).toBe("青露萝卜 3/1");
    expect(ready.nextStep).toContain("禾木");
    expect(ready.nextStep).toContain("E");
    expect(ready.nextStep).toContain("交付");
    s.inventory.remove("dew_radish", 3);
    expect(getQuestGuidance(s, "farm").status).toBe("active");
  });

  it.each(["forest", "town"] as const)("does not mark an unaccepted %s request ready despite enough materials", area => {
    const s = fresh();
    s.inventory.add("wild_mushroom", 9);
    s.inventory.add("branch", 9);
    s.inventory.add("stone", 9);
    expect(getQuestGuidance(s, area).status).toBe("available");
  });

  it("tracks three forest mushrooms and returns to active if a meal uses two", () => {
    const s = fresh();
    expect(s.acceptExplorationQuest("forest").ok).toBe(true);
    s.chest.add("wild_mushroom", 3);
    let guidance = getQuestGuidance(s, "forest");
    expect(guidance.status).toBe("active");
    expect(guidance.requirements).toEqual([{ itemId: "wild_mushroom", name: "野蘑菇", have: 0, need: 3 }]);
    expect(guidance.nextStep).toContain("森林");
    expect(guidance.nextStep).toContain("采集");
    s.inventory.add("wild_mushroom", 3);
    guidance = getQuestGuidance(s, "forest");
    expect(guidance.status).toBe("ready");
    expect(guidance.progress).toBe("野蘑菇 3/3");
    expect(guidance.nextStep).toMatch(/岚.*E.*交付|岚.*交付.*E/);
    expect(s.craftItem("mushroom_meal").ok).toBe(true);
    expect(getQuestGuidance(s, "forest")).toMatchObject({ status: "active", progress: "野蘑菇 1/3" });
  });

  it("requires both carpenter materials in the backpack and shows actual quantities", () => {
    const s = fresh();
    expect(s.acceptExplorationQuest("carpenter").ok).toBe(true);
    s.inventory.add("branch", 3); s.inventory.add("stone", 1);
    s.chest.add("branch", 20); s.chest.add("stone", 20);
    const partial = getQuestGuidance(s, "town");
    expect(partial.status).toBe("active");
    expect(partial.progress).toBe("枯枝 3/6 · 溪石 1/4");
    expect(partial.requirements).toEqual([
      { itemId: "branch", name: "枯枝", have: 3, need: 6 },
      { itemId: "stone", name: "溪石", have: 1, need: 4 },
    ]);
    s.inventory.add("branch", 7);
    expect(getQuestGuidance(s, "town")).toMatchObject({ status: "active", progress: "枯枝 10/6 · 溪石 1/4" });
    s.inventory.add("stone", 3);
    const ready = getQuestGuidance(s, "town");
    expect(ready.status).toBe("ready");
    expect(ready.nextStep).toContain("阿榆");
    expect(ready.nextStep).toContain("E");
    expect(ready.nextStep).toContain("交付");
    expect(s.transferChest("stone", 1, "deposit").ok).toBe(true);
    expect(getQuestGuidance(s, "town").status).toBe("active");
  });

  it.each(["farm", "forest", "town"] as const)("keeps %s completed even when spare delivery stock remains", area => {
    const s = fresh();
    if (area === "farm") {
      s.acceptIntroQuest(); s.inventory.add("dew_radish", 3);
      expect(s.completeIntroQuest().ok).toBe(true);
    } else {
      const kind = area === "forest" ? "forest" : "carpenter";
      s.acceptExplorationQuest(kind);
      s.inventory.add("wild_mushroom", 9); s.inventory.add("branch", 18); s.inventory.add("stone", 12);
      expect(s.completeExplorationQuest(kind).ok).toBe(true);
    }
    const before = snapshot(s), guidance = getQuestGuidance(s, area);
    expect(guidance.status).toBe("completed");
    expect(guidance.nextStep).toMatch(/探索|制作/);
    expect(guidance.nextStep).not.toContain("交付");
    expect(snapshot(s)).toEqual(before);
  });

  it("reads snapshots without persisting, consuming stock or changing any session state", () => {
    const storage = new MemoryStorage(), s = fresh(storage);
    s.acceptIntroQuest(); s.acceptExplorationQuest("forest"); s.acceptExplorationQuest("carpenter");
    s.inventory.add("dew_radish", 1); s.inventory.add("wild_mushroom", 3);
    s.inventory.add("branch", 6); s.inventory.add("stone", 4);
    s.saveGame();
    const before = snapshot(s), raw = storage.get(SAVE_KEY);
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const area of ["farm", "forest", "town"] satisfies AreaId[]) getQuestGuidance(s, area);
    }
    expect(snapshot(s)).toEqual(before);
    expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("returns independent requirement arrays rather than exposing shared presentation state", () => {
    const s = fresh(); s.acceptExplorationQuest("carpenter"); s.inventory.add("branch", 3);
    const first = getQuestGuidance(s, "town");
    first.requirements[0].have = 999; first.requirements[0].name = "changed";
    first.requirements.push({ itemId: "fake", name: "fake", have: 0, need: 1 });
    const second = getQuestGuidance(s, "town");
    expect(second.requirements).toEqual([
      { itemId: "branch", name: "枯枝", have: 3, need: 6 },
      { itemId: "stone", name: "溪石", have: 0, need: 4 },
    ]);
    expect(s.inventory.count("branch")).toBe(3);
  });

  it("reconstructs the same ready guidance after a real save reload", () => {
    const storage = new MemoryStorage(), s = fresh(storage);
    s.acceptIntroQuest(); s.acceptExplorationQuest("forest");
    s.inventory.add("dew_radish", 1); s.inventory.add("wild_mushroom", 3);
    expect(s.saveGame()).toBe(true);
    const farm = getQuestGuidance(s, "farm"), forest = getQuestGuidance(s, "forest");
    const restored = fresh(storage); expect(restored.loadGame()).toBe(true);
    expect(getQuestGuidance(restored, "farm")).toEqual(farm);
    expect(getQuestGuidance(restored, "forest")).toEqual(forest);
  });

  it("stays ready after failed delivery persistence rolls the transaction back", () => {
    class FaultStorage extends MemoryStorage {
      fail = false;
      override set(key: string, value: string): void {
        if (this.fail) throw new Error("quota");
        super.set(key, value);
      }
    }
    const storage = new FaultStorage(), s = fresh(storage);
    s.acceptExplorationQuest("forest"); s.inventory.add("wild_mushroom", 3);
    expect(s.saveGame()).toBe(true);
    const before = snapshot(s), raw = storage.get(SAVE_KEY);
    storage.fail = true;
    expect(s.completeExplorationQuest("forest")).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before);
    expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(getQuestGuidance(s, "forest")).toMatchObject({ status: "ready", progress: "野蘑菇 3/3" });
  });
});
