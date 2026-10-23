import { describe, expect, it } from "vitest";
import { initGameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY } from "../src/persistence/save";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";

const make = (storage = new MemoryStorage()) => initGameSession(new SaveManager(storage));
const snapshot = (s: ReturnType<typeof make>) => ({ gold: s.economy.goldValue, day: s.time.date.day, inventory: s.inventory.serialize(), farming: s.farming.serialize(), chest: s.chest.serialize() });
const empty = () => ({ capacity: 24, slots: Array(24).fill(null) });

describe("persistent home storage", () => {
  it("deposits and withdraws exact counts across fresh sessions without duplicating tools", () => {
    const storage = new MemoryStorage(); let s = make(storage); s.newGame();
    s.inventory.add("dew_radish_seed", 10);
    expect(s.transferChest("dew_radish_seed", 7, "deposit")).toEqual({ ok: true, value: undefined });
    expect(s.inventory.count("dew_radish_seed")).toBe(3); expect(s.chest.count("dew_radish_seed")).toBe(7);
    expect(s.transferChest("hoe", 1, "deposit").ok).toBe(true);
    expect(s.inventory.count("hoe")).toBe(0); expect(s.chest.count("hoe")).toBe(1);
    const persisted = snapshot(s); s = make(storage); expect(s.loadGame()).toBe(true); expect(snapshot(s)).toEqual(persisted);
    expect(s.transferChest("hoe", 1, "withdraw").ok).toBe(true);
    expect(s.transferChest("dew_radish_seed", 4, "withdraw").ok).toBe(true);
    expect(s.inventory.count("hoe")).toBe(1); expect(s.chest.count("hoe")).toBe(0);
    expect(s.inventory.count("dew_radish_seed")).toBe(7); expect(s.chest.count("dew_radish_seed")).toBe(3);
    const restored = make(storage); expect(restored.loadGame()).toBe(true); expect(snapshot(restored)).toEqual(snapshot(s));
  });

  it("restores farm, backpack, chest and gold/day together in current save version", () => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); s.buyItem("dew_radish_seed", 3);
    s.actions.till("8_12"); s.actions.plant("8_12", "dew_radish_seed"); s.actions.water("8_12"); s.sleep();
    expect(s.transferChest("dew_radish_seed", 1, "deposit").ok).toBe(true);
    const raw = JSON.parse(storage.get(SAVE_KEY)!); expect(raw.version).toBe(SAVE_VERSION);
    const next = make(storage); expect(next.loadGame()).toBe(true); expect(snapshot(next)).toEqual(snapshot(s));
  });

  it.each([0, -1, 0.5, NaN, Infinity, 2377])("rejects invalid quantities %s without side effects", amount => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); s.saveGame(); const before = snapshot(s); const raw = storage.get(SAVE_KEY);
    for (const direction of ["deposit", "withdraw"] as const) expect(s.transferChest("hoe", amount, direction)).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("rejects empty source, unknown item and invalid runtime direction", () => {
    const s = make(); s.newGame(); const before = snapshot(s);
    expect(s.transferChest("dew_radish", 1, "deposit")).toEqual({ ok: false, reason: "NOT_ENOUGH" });
    expect(s.transferChest("hoe", 1, "withdraw")).toEqual({ ok: false, reason: "NOT_ENOUGH" });
    expect(s.transferChest("missing", 1, "deposit")).toEqual({ ok: false, reason: "UNKNOWN_ITEM" });
    expect(s.transferChest("hoe", 1, "garbage" as "deposit")).toEqual({ ok: false, reason: "INVALID_DIRECTION" });
    expect(snapshot(s)).toEqual(before);
  });

  it("full chest and full backpack leave both containers unchanged", () => {
    const s = make(); s.newGame(); s.inventory.add("dew_radish_seed", 3); s.chest.add("watering_can", 24);
    let before = snapshot(s);
    expect(s.transferChest("dew_radish_seed", 1, "deposit")).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(snapshot(s)).toEqual(before);
    s.inventory.add("hoe", 21); before = snapshot(s);
    expect(s.transferChest("watering_can", 1, "withdraw")).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(snapshot(s)).toEqual(before);
  });

  it("deposits into existing stacks when chest has no empty slot", () => {
    const s = make(); s.newGame(); s.inventory.add("dew_radish_seed", 3); s.chest.add("hoe", 23); s.chest.add("dew_radish_seed", 95);
    expect(s.transferChest("dew_radish_seed", 3, "deposit").ok).toBe(true);
    expect(s.chest.count("dew_radish_seed")).toBe(98); expect(s.inventory.count("dew_radish_seed")).toBe(0);
  });

  it("storage failure rolls both containers back and preserves primary", () => {
    class Storage extends MemoryStorage {
      fail = false;
      override set(key: string, value: string): void { if (this.fail && key === SAVE_KEY) throw new Error("quota"); super.set(key, value); }
    }
    const storage = new Storage(); const s = make(storage); s.newGame(); s.chest.add("dew_radish_seed", 4); s.saveGame();
    const before = snapshot(s); const raw = storage.get(SAVE_KEY); storage.fail = true;
    expect(s.transferChest("hoe", 1, "deposit")).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.transferChest("dew_radish_seed", 2, "withdraw")).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("newGame empties the chest in memory without touching the previous save", () => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); s.transferChest("hoe", 1, "deposit"); const raw = storage.get(SAVE_KEY);
    s.newGame(); expect(s.chest.serialize()).toEqual(empty()); expect(s.inventory.count("hoe")).toBe(1); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
});

describe("V3 compatibility and strict chest validation", () => {
  const legacyV2 = () => ({ version: 2, gold: 733, day: 5, inventory: { capacity: 24, slots: [{ itemId: "hoe", amount: 1 }, { itemId: "dew_radish_seed", amount: 8 }, ...Array(22).fill(null)] }, farming: [{ id: "8_12", tilled: true, watered: true, crop: { cropId: "dew_radish", growthDay: 2, harvestedCount: 0 } }] });
  it("migrates V2 without losing backpack or crops and preserves exact old bytes", () => {
    const storage = new MemoryStorage(); const legacy = legacyV2(); const raw = JSON.stringify(legacy); storage.set(SAVE_KEY, raw);
    const s = make(storage); expect(s.loadGame()).toBe(true); expect(s.chest.serialize()).toEqual(empty()); expect(s.inventory.serialize()).toEqual(legacy.inventory);
    expect(s.farming.serialize()["8_12"]).toEqual(legacy.farming[0]); expect(s.economy.goldValue).toBe(733); expect(s.time.date.day).toBe(5); expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.saveGame()).toBe(true); expect(storage.get(SAVE_BACKUP_KEY)).toBe(raw); expect(JSON.parse(storage.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
  });

  it("V1 also migrates with empty chest and initial tools", () => {
    const storage = new MemoryStorage(); storage.set(SAVE_KEY, JSON.stringify({ version: 1, gold: 700, day: 4 }));
    const s = make(storage); expect(s.loadGame()).toBe(true); expect(s.chest.serialize()).toEqual(empty()); expect(s.inventory.count("hoe")).toBe(1);
  });

  it("does not accept a chest or unknown extra field disguised as V2", () => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); const before = snapshot(s);
    for (const data of [{ ...legacyV2(), chest: empty() }, { ...legacyV2(), surprise: true }]) { storage.set(SAVE_KEY, JSON.stringify(data)); expect(s.loadGame()).toBe(false); expect(snapshot(s)).toEqual(before); }
  });

  it.each([
    (data: any) => { delete data.chest; },
    (data: any) => { data.chest = null; },
    (data: any) => { data.chest.capacity = 25; },
    (data: any) => { data.chest.slots.pop(); },
    (data: any) => { data.chest.slots[0] = { itemId: "missing", amount: 1 }; },
    (data: any) => { data.chest.slots[0] = { itemId: "hoe", amount: 2 }; },
    (data: any) => { data.chest.slots[0] = { itemId: "dew_radish_seed", amount: 100 }; },
    (data: any) => { data.chest.slots[0] = { itemId: "dew_radish_seed", amount: 0.5 }; },
    (data: any) => { data.chest.slots[0] = { itemId: "dew_radish_seed", amount: -1 }; },
    (data: any) => { data.chest.slots[0] = { itemId: "dew_radish_seed", amount: 0 }; },
    (data: any) => { data.chest.unknown = true; },
  ])("rejects malformed chest without partially restoring session #%#", mutate => {
    const storage = new MemoryStorage(); const s = make(storage); s.newGame(); s.chest.add("hoe", 1); const before = snapshot(s);
    const data = { ...legacyV2(), version: 3, chest: empty() }; mutate(data); const raw = JSON.stringify(data); storage.set(SAVE_KEY, raw);
    expect(s.loadGame()).toBe(false); expect(snapshot(s)).toEqual(before); expect(s.saveGame()).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
});
