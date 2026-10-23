import { describe, expect, it } from "vitest";
import { initGameSession, type GameSession } from "../src/game/systems/GameSession";
import { MAX_GOLD, MemoryStorage, SaveManager, SAVE_BACKUP_KEY } from "../src/persistence/save";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";

function fresh(storage = new MemoryStorage()) {
  const session = initGameSession(new SaveManager(storage)); session.newGame(); return session;
}
function snapshot(session: GameSession) {
  return {
    quest: session.introQuest.serialize(), inventory: session.inventory.serialize(),
    chest: session.chest.serialize(), farming: session.farming.serialize(),
    daily: session.life.serialize(), day: session.time.date.day, gold: session.economy.goldValue,
  };
}

describe("merchant introductory quest transactions", () => {
  it("accepts exactly once, gifts three seeds and persists the locked goal without time or energy cost", () => {
    const storage = new MemoryStorage(), s = fresh(storage);
    s.life.restore({ minute: 650, energy: 0 });
    const daily = s.life.serialize();
    expect(s.acceptIntroQuest()).toEqual({ ok: true, value: undefined });
    expect(s.inventory.count("dew_radish_seed")).toBe(3);
    expect(s.introQuest.state).toEqual({ status: "active", cropId: "dew_radish" });
    expect(s.life.serialize()).toEqual(daily); expect(s.time.date.day).toBe(1); expect(s.economy.goldValue).toBe(500);
    const before = snapshot(s), raw = storage.get(SAVE_KEY);
    expect(s.acceptIntroQuest()).toEqual({ ok: false, reason: "QUEST_ALREADY_ACCEPTED" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(JSON.parse(raw!).introQuest).toEqual(before.quest);
  });
  it("rejects a full or partially stackable backpack without taking the quest or partially gifting", () => {
    const storage = new MemoryStorage(), s = fresh(storage);
    for (const partial of [false, true]) {
      s.inventory.restore({ capacity: 24, slots: Array.from({ length: 24 }, (_, index) =>
        partial && index === 0 ? { itemId: "dew_radish_seed", amount: 98 } : { itemId: "hoe", amount: 1 }) });
      const before = snapshot(s);
      expect(s.acceptIntroQuest()).toEqual({ ok: false, reason: "INVENTORY_FULL" });
      expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBeNull();
    }
  });
  it("requires an active goal and a matching backpack crop; seeds and chest stock do not count", () => {
    const s = fresh();
    expect(s.completeIntroQuest()).toEqual({ ok: false, reason: "QUEST_NOT_ACTIVE" });
    s.acceptIntroQuest(); s.chest.add("dew_radish", 2); s.inventory.add("starberry", 3);
    const before = snapshot(s);
    expect(s.completeIntroQuest()).toEqual({ ok: false, reason: "NOT_ENOUGH" });
    expect(snapshot(s)).toEqual(before);
    expect(s.inventory.count("dew_radish_seed")).toBe(3);
  });
  it("consumes exactly one locked crop, preserves extras, rewards 120 and never rewards twice", () => {
    const storage = new MemoryStorage(), s = fresh(storage);
    s.acceptIntroQuest(); s.inventory.add("dew_radish", 3); s.inventory.add("starberry", 4);
    s.chest.add("dew_radish", 2); s.life.restore({ minute: 850, energy: 17 });
    s.time.setDay(15); // Existing spring request stays spring even in summer.
    const daily = s.life.serialize();
    expect(s.completeIntroQuest()).toEqual({ ok: true, value: undefined });
    expect(s.introQuest.state).toEqual({ status: "completed", cropId: "dew_radish" });
    expect(s.inventory.count("dew_radish")).toBe(2); expect(s.inventory.count("starberry")).toBe(4);
    expect(s.chest.count("dew_radish")).toBe(2); expect(s.economy.goldValue).toBe(620);
    expect(s.life.serialize()).toEqual(daily); expect(s.time.date.day).toBe(15);
    const before = snapshot(s), raw = storage.get(SAVE_KEY);
    expect(s.completeIntroQuest()).toEqual({ ok: false, reason: "QUEST_NOT_ACTIVE" });
    expect(s.acceptIntroQuest()).toEqual({ ok: false, reason: "QUEST_ALREADY_ACCEPTED" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
  it("checks the exact gold limit before consuming the delivery", () => {
    const s = fresh(); s.acceptIntroQuest(); s.inventory.add("dew_radish", 1);
    s.economy.setGold(MAX_GOLD - 119); const before = snapshot(s);
    expect(s.completeIntroQuest()).toEqual({ ok: false, reason: "GOLD_LIMIT" }); expect(snapshot(s)).toEqual(before);
    s.economy.setGold(MAX_GOLD - 120);
    expect(s.completeIntroQuest().ok).toBe(true); expect(s.economy.goldValue).toBe(MAX_GOLD);
  });
});

describe("quest persistence and failure rollback", () => {
  class FaultStorage extends MemoryStorage {
    failKey: string | null = null;
    override set(key: string, value: string): void { if (key === this.failKey) throw new Error("quota"); super.set(key, value); }
  }
  it.each([SAVE_KEY, SAVE_BACKUP_KEY])("rolls back gift, quest, gold and other state when writing %s fails", failKey => {
    const storage = new FaultStorage(), s = fresh(storage);
    s.actions.till("8_12"); s.chest.add("starberry_seed", 2); s.life.restore({ minute: 680, energy: 17 });
    expect(s.saveGame()).toBe(true); const before = snapshot(s), raw = storage.get(SAVE_KEY);
    storage.failKey = failKey;
    expect(s.acceptIntroQuest()).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
  it.each([SAVE_KEY, SAVE_BACKUP_KEY])("rolls back delivery, reward and completion when writing %s fails", failKey => {
    const storage = new FaultStorage(), s = fresh(storage);
    s.acceptIntroQuest(); s.inventory.add("dew_radish", 2); s.saveGame();
    const before = snapshot(s), raw = storage.get(SAVE_KEY); storage.failKey = failKey;
    expect(s.completeIntroQuest()).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
  it("reloads active and completed requests without replacing service identities or farming/daily/chest", () => {
    const storage = new MemoryStorage(), s = fresh(storage);
    s.actions.till("8_12"); s.actions.water("8_12"); s.chest.add("starberry_seed", 2);
    s.life.restore({ minute: 680, energy: 17 }); s.acceptIntroQuest();
    const before = snapshot(s), reloaded = fresh(storage), reference = reloaded.introQuest;
    expect(reloaded.loadGame()).toBe(true); expect(reloaded.introQuest).toBe(reference); expect(snapshot(reloaded)).toEqual(before);
    reloaded.inventory.add("dew_radish", 1); expect(reloaded.completeIntroQuest().ok).toBe(true);
    const completed = snapshot(reloaded), reloadedAgain = fresh(storage);
    expect(reloadedAgain.loadGame()).toBe(true); expect(snapshot(reloadedAgain)).toEqual(completed);
    expect(reloadedAgain.acceptIntroQuest().ok).toBe(false);
    reloadedAgain.newGame(); expect(reloadedAgain.introQuest.state).toEqual({ status: "available", cropId: null });
  });
  it("migrates a legacy V4 to available while preserving its entire previous state", () => {
    const storage = new MemoryStorage(), s = fresh(storage);
    s.actions.till("8_12"); s.inventory.add("dew_radish_seed", 4); s.actions.plant("8_12", "dew_radish_seed");
    s.chest.add("starberry_seed", 2); s.life.restore({ minute: 680, energy: 17 });
    const prior = snapshot(s);
    const legacy = { version: 4, gold: prior.gold, day: prior.day, daily: prior.daily,
      inventory: prior.inventory, chest: prior.chest, farming: Object.values(prior.farming) };
    const raw = JSON.stringify(legacy); storage.set(SAVE_KEY, raw);
    const restored = fresh(storage); expect(restored.loadGame()).toBe(true);
    expect(snapshot(restored)).toEqual(prior);
    expect(restored.acceptIntroQuest().ok).toBe(true);
    expect(storage.get(SAVE_BACKUP_KEY)).toBe(raw);
    expect(JSON.parse(storage.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
  });
});
