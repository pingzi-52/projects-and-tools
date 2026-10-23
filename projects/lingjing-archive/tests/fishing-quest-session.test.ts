import { describe, expect, it } from "vitest";
import { initGameSession, type GameSession } from "../src/game/systems/GameSession";
import { MAX_GOLD, MemoryStorage, SaveManager, SAVE_BACKUP_KEY } from "../src/persistence/save";
import { SAVE_KEY } from "../src/domain/models/types";

const fresh = (storage = new MemoryStorage()) => { const s = initGameSession(new SaveManager(storage)); s.newGame(); return s; };
const snapshot = (s: GameSession) => ({ quest: s.fishingQuest.serialize(), bag: s.inventory.serialize(), chest: s.chest.serialize(), gold: s.economy.goldValue, daily: s.life.serialize(), exploration: s.exploration.serialize(), farming: s.farming.serialize(), day: s.time.date.day });
class FaultStorage extends MemoryStorage {
  failKey: string | null = null;
  override set(key: string, value: string): void { if (key === this.failKey) throw new Error("quota"); super.set(key, value); }
}

describe("first fishing quest transactions", () => {
  it("accepts explicitly without consuming stock, energy or time and persists exactly once", () => {
    const storage = new MemoryStorage(), s = fresh(storage); s.inventory.add("sun_carp", 2); s.life.restore({ minute: 650, energy: 0 });
    const before = snapshot(s);
    expect(s.acceptFishingQuest()).toEqual({ ok: true, value: undefined });
    expect(snapshot(s)).toEqual({ ...before, quest: { status: "active" } });
    const raw = storage.get(SAVE_KEY); expect(s.acceptFishingQuest()).toEqual({ ok: false, reason: "QUEST_ALREADY_ACCEPTED" }); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
  it.each(["silver_crucian", "sun_carp"])("requires explicit selected %s; consumes exactly one, preserves other fish, rewards once across reload", id => {
    const storage = new MemoryStorage(), s = fresh(storage); s.acceptFishingQuest(); s.inventory.add("silver_crucian", 3); s.inventory.add("sun_carp", 3); s.chest.add(id, 2);
    const before = snapshot(s); expect(s.completeFishingQuest(id)).toEqual({ ok: true, value: undefined });
    expect(s.inventory.count(id)).toBe(2); expect(s.inventory.count(id === "sun_carp" ? "silver_crucian" : "sun_carp")).toBe(3);
    expect(s.chest.serialize()).toEqual(before.chest); expect(s.economy.goldValue).toBe(560); expect(s.life.serialize()).toEqual(before.daily);
    const loaded = fresh(storage); expect(loaded.loadGame()).toBe(true); expect(loaded.fishingQuest.state.status).toBe("completed");
    const done = snapshot(loaded); expect(loaded.completeFishingQuest(id)).toEqual({ ok: false, reason: "QUEST_NOT_ACTIVE" }); expect(loaded.acceptFishingQuest().ok).toBe(false); expect(snapshot(loaded)).toEqual(done);
  });
  it("requires acceptance and current inventory stock, rejecting chest-only stock and nonfish", () => {
    const s = fresh(); s.inventory.add("sun_carp", 1); expect(s.completeFishingQuest("sun_carp")).toEqual({ ok: false, reason: "QUEST_NOT_ACTIVE" });
    s.acceptFishingQuest(); s.chest.add("silver_crucian", 2); const before = snapshot(s);
    expect(s.completeFishingQuest("silver_crucian")).toEqual({ ok: false, reason: "NOT_ENOUGH" });
    for (const id of ["", "wood", "dew_radish", "unknown"]) expect(s.completeFishingQuest(id)).toEqual({ ok: false, reason: "INVALID_FISH" });
    expect(snapshot(s)).toEqual(before);
  });
  it("enforces gold boundary before removal and accepts exact cap", () => {
    const s = fresh(); s.acceptFishingQuest(); s.inventory.add("sun_carp", 1); s.economy.setGold(MAX_GOLD - 59); const before = snapshot(s);
    expect(s.completeFishingQuest("sun_carp")).toEqual({ ok: false, reason: "GOLD_LIMIT" }); expect(snapshot(s)).toEqual(before);
    s.economy.setGold(MAX_GOLD - 60); expect(s.completeFishingQuest("sun_carp").ok).toBe(true); expect(s.economy.goldValue).toBe(MAX_GOLD);
  });
  it.each([SAVE_KEY, SAVE_BACKUP_KEY])("rolls back acceptance and completion when %s fails, preserving fractional clock", failKey => {
    const storage = new FaultStorage(), s = fresh(storage); for (let i = 0; i < 6; i++) s.advanceTime(1000); s.inventory.add("sun_carp", 2); s.saveGame();
    let before = snapshot(s), raw = storage.get(SAVE_KEY); storage.failKey = failKey;
    expect(s.acceptFishingQuest()).toEqual({ ok: false, reason: "SAVE_FAILED" }); expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
    storage.failKey = null; s.acceptFishingQuest(); before = snapshot(s); raw = storage.get(SAVE_KEY); storage.failKey = failKey;
    expect(s.completeFishingQuest("sun_carp")).toEqual({ ok: false, reason: "SAVE_FAILED" }); expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.advanceTime(1000)).toBe(true); expect(s.life.minute).toBe(370);
    storage.failKey = null; expect(s.completeFishingQuest("sun_carp").ok).toBe(true);
  });
  it("preserves quest on sleep and casting/cancel, reload retains service identity, new game resets", () => {
    const storage = new MemoryStorage(), s = fresh(storage); s.acceptFishingQuest(); s.sleep(); s.castFishing(); s.cancelFishing(); s.saveGame();
    expect(s.fishingQuest.state.status).toBe("active"); const loaded = fresh(storage), reference = loaded.fishingQuest;
    expect(loaded.loadGame()).toBe(true); expect(loaded.fishingQuest).toBe(reference); expect(loaded.fishingQuest.state.status).toBe("active");
    storage.set(SAVE_KEY, "bad"); expect(loaded.loadGame()).toBe(false); expect(loaded.fishingQuest.state.status).toBe("active"); loaded.newGame(); expect(loaded.fishingQuest.state.status).toBe("available");
  });
});
