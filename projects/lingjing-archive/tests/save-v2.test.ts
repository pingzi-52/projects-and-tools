import { describe, expect, it } from "vitest";
import { initGameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager } from "../src/persistence/save";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";

const make = (storage = new MemoryStorage()) => initGameSession(new SaveManager(storage));
const snapshot = (s: ReturnType<typeof make>) => ({ gold: s.economy.goldValue, day: s.time.date.day, farming: s.farming.serialize(), inventory: s.inventory.serialize(), chest: s.chest.serialize() });

describe("complete farm save and trading loop", () => {
  it("buy, grow across restored sessions, harvest, sell and persist", () => {
    const storage = new MemoryStorage();
    let s = make(storage);
    s.newGame();
    expect(s.buyItem("dew_radish_seed", 2)).toEqual({ ok: true, value: undefined });
    expect(s.economy.goldValue).toBe(480);
    s.actions.till("8_12");
    s.actions.plant("8_12", "dew_radish_seed");
    for (let day = 0; day < 4; day++) {
      s.actions.water("8_12");
      expect(s.saveGame()).toBe(true);
      const before = snapshot(s);
      s = make(storage);
      expect(s.loadGame()).toBe(true);
      expect(snapshot(s)).toEqual(before);
      s.sleep();
    }
    expect(s.actions.harvest("8_12").ok).toBe(true);
    expect(s.sellItem("dew_radish", 1)).toEqual({ ok: true, value: undefined });
    expect(s.economy.goldValue).toBe(504);
    const restored = make(storage);
    expect(restored.loadGame()).toBe(true);
    expect(snapshot(restored)).toEqual(snapshot(s));
  });

  it("migrates v1 in memory and keeps original as backup on next save", () => {
    const storage = new MemoryStorage();
    const legacy = JSON.stringify({ version: 1, gold: 1234, day: 7 });
    storage.set(SAVE_KEY, legacy);
    const s = make(storage);
    expect(s.loadGame()).toBe(true);
    expect(s.inventory.hotbar().slice(0, 2)).toEqual(["hoe", "watering_can"]);
    expect(s.farming.serialize()).toEqual({});
    expect(storage.get(SAVE_KEY)).toBe(legacy);
    expect(s.saveGame()).toBe(true);
    expect(JSON.parse(storage.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
    expect(s.save.hasBackup()).toBe(true);
  });

  it.each([0, -1, 0.5, NaN, Infinity, 99999999])("rejects invalid trade quantity %s atomically", (amount) => {
    const s = make(); s.newGame(); s.inventory.add("dew_radish", 2);
    const before = snapshot(s);
    expect(s.buyItem("dew_radish_seed", amount).ok).toBe(false);
    expect(s.sellItem("dew_radish", amount).ok).toBe(false);
    expect(snapshot(s)).toEqual(before);
  });

  it("rejects unavailable items, unsellable tools, shortages and full inventory", () => {
    const s = make(); s.newGame(); const before = snapshot(s);
    for (const id of ["missing", "ember_tomato_seed", "dew_radish"]) expect(s.buyItem(id, 1).ok).toBe(false);
    expect(s.sellItem("hoe", 1).ok).toBe(false);
    expect(s.sellItem("dew_radish", 1).ok).toBe(false);
    expect(s.buyItem("starberry_seed", 20).ok).toBe(false);
    expect(snapshot(s)).toEqual(before);
    s.inventory.add("hoe", 22);
    const full = snapshot(s);
    expect(s.buyItem("dew_radish_seed", 1)).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(snapshot(s)).toEqual(full);
  });

  it("failed persistence rolls back trade and exposes failure", () => {
    class FailingStorage extends MemoryStorage { override set(): void { throw new Error("quota"); } }
    const s = make(new FailingStorage()); s.newGame(); s.inventory.add("dew_radish", 1);
    const before = snapshot(s);
    expect(s.saveGame()).toBe(false);
    expect(s.buyItem("dew_radish_seed", 1)).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.sellItem("dew_radish", 1)).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before);
  });

  it("primary overwrite failure rolls back trade and leaves prior save intact", () => {
    class Storage extends MemoryStorage {
      fail = false;
      override set(key: string, value: string): void { if (this.fail && key === SAVE_KEY) throw new Error("quota"); super.set(key, value); }
    }
    const storage = new Storage(); const s = make(storage); s.newGame(); s.inventory.add("dew_radish", 1); s.saveGame();
    const raw = storage.get(SAVE_KEY); const before = snapshot(s); storage.fail = true;
    expect(s.buyItem("dew_radish_seed", 1)).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.sellItem("dew_radish", 1)).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("newGame does not touch persisted farm", () => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); s.actions.till("8_12");
    expect(s.saveGame()).toBe(true); const raw = storage.get(SAVE_KEY);
    s.newGame(); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("swaps backpack slots into hotbar and persists across sessions", () => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame();
    const state = s.inventory.serialize(); state.slots[10] = { itemId: "dew_radish_seed", amount: 3 }; s.inventory.restore(state);
    expect(s.moveInventorySlot(10, 0)).toEqual({ ok: true, value: undefined });
    expect(s.inventory.hotbar()[0]).toBe("dew_radish_seed");
    expect(s.inventory.serialize().slots[10]).toEqual({ itemId: "hoe", amount: 1 });
    const restored = make(storage); expect(restored.loadGame()).toBe(true); expect(restored.inventory.serialize()).toEqual(s.inventory.serialize());
    const before = snapshot(s);
    for (const [from, to] of [[-1, 0], [24, 1], [0, 24], [0.5, 0], [0, NaN]]) expect(s.moveInventorySlot(from, to).ok).toBe(false);
    expect(snapshot(s)).toEqual(before);
  });

  it("slot exchange rolls back on storage failure", () => {
    class FailingStorage extends MemoryStorage { override set(): void { throw new Error("quota"); } }
    const s = make(new FailingStorage()); s.newGame(); const before = snapshot(s);
    expect(s.moveInventorySlot(0, 10)).toEqual({ ok: false, reason: "SAVE_FAILED" }); expect(snapshot(s)).toEqual(before);
  });
});

describe("strict versioned save validation and recovery", () => {
  const valid = () => ({ version: 2, gold: 500, day: 1, farming: [{ id: "8_12", tilled: true, watered: false, crop: { cropId: "dew_radish", growthDay: 0, harvestedCount: 0 } }], inventory: { capacity: 24, slots: [{ itemId: "hoe", amount: 1 }, ...Array(23).fill(null)] } });
  it.each([
    (d: any) => { d.version = 99; },
    (d: any) => { delete d.version; },
    (d: any) => { d.gold = -1; },
    (d: any) => { d.gold = 1.5; },
    (d: any) => { d.gold = 1e300; },
    (d: any) => { d.day = 0; },
    (d: any) => { d.inventory.capacity = 23; },
    (d: any) => { d.inventory.slots.pop(); },
    (d: any) => { d.inventory.slots[0].itemId = "nope"; },
    (d: any) => { d.inventory.slots[0].amount = 2; },
    (d: any) => { d.farming[0].crop.cropId = "nope"; },
    (d: any) => { d.farming[0].crop.growthDay = -1; },
    (d: any) => { d.farming[0].crop.harvestedCount = 1; },
    (d: any) => { d.farming[0].watered = "true"; },
    (d: any) => { d.farming[0].tilled = false; },
    (d: any) => { d.farming[0].id = "999_999"; },
    (d: any) => { d.farming[0].id = "0_0"; },
    (d: any) => { d.farming[0].id = "8_8"; },
    (d: any) => { d.farming[0].id = "16_26"; },
    (d: any) => { d.farming.push(d.farming[0]); },
    (d: any) => { d.farming = {}; },
  ])("rejects malformed save without changing a live session #%#", (mutate) => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); s.inventory.add("dew_radish_seed", 3);
    const before = snapshot(s); const data = valid(); mutate(data); const raw = JSON.stringify(data); storage.set(SAVE_KEY, raw);
    expect(s.loadGame()).toBe(false); expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.saveGame()).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("rejects oversized raw JSON and handles read failure", () => {
    const storage = new MemoryStorage(); storage.set(SAVE_KEY, " ".repeat(300000) + JSON.stringify(valid()));
    expect(new SaveManager(storage).load()).toBeNull();
    class Unreadable extends MemoryStorage { override get(): string | null { throw new Error("blocked"); } }
    expect(new SaveManager(new Unreadable()).load()).toBeNull();
    expect(new SaveManager(new Unreadable()).hasStoredData()).toBe(true);
    expect(new SaveManager(new MemoryStorage()).hasStoredData()).toBe(false);
  });

  it("recovers last valid backup and clear keeps it recoverable", () => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); s.saveGame();
    s.economy.setGold(777); s.saveGame(); storage.set(SAVE_KEY, "broken");
    expect(s.save.restoreBackup()).toBe(true); expect(s.loadGame()).toBe(true); expect(s.economy.goldValue).toBe(500);
    expect(s.save.clear()).toBe(true); expect(s.save.load()).toBeNull(); expect(s.save.hasBackup()).toBe(true);
    expect(s.save.restoreBackup()).toBe(true); expect(s.loadGame()).toBe(true);
  });

  it("backup write failure leaves original primary untouched", () => {
    class Storage extends MemoryStorage { fail = false; override set(key: string, value: string): void { if (this.fail && key !== SAVE_KEY) throw new Error("quota"); super.set(key, value); } }
    const storage = new Storage(); const s = make(storage); s.newGame(); s.saveGame(); const raw = storage.get(SAVE_KEY);
    storage.fail = true; s.economy.setGold(666); expect(s.saveGame()).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.save.clear()).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
});
