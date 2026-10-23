import { describe, expect, it } from "vitest";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY, SAVE_RECOVERY_KEY } from "../src/persistence/save";

const empty = () => ({ capacity: 24, slots: Array(24).fill(null) });
const defaults = (day = 6) => ({ forageDay: day, picked: [] as string[], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false });
const v5 = () => ({ version: 5, gold: 777, day: 6, inventory: { capacity: 24, slots: [{ itemId: "dew_radish_seed", amount: 11 }, ...Array(23).fill(null)] }, chest: empty(), farming: [{ id: "8_12", tilled: true, watered: true, crop: { cropId: "dew_radish", growthDay: 2, harvestedCount: 0 } }], daily: { minute: 820, energy: 47 }, introQuest: { status: "active" as const, cropId: "dew_radish" } });
const v6 = () => ({ ...v5(), version: 6, exploration: defaults() });

const current = (data = v6()) => ({ ...data, version: SAVE_VERSION, fishingQuest: { status: "available" } });

describe("V6 exploration save contract", () => {
  it("writes the current complete schema and copies exploration arrays", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const data = v6(); data.exploration.picked.push("wood_a", "stone_c", "mushroom_b");
    expect(SAVE_VERSION).toBe(7); expect(save.save(data as any)).toBe(true); expect(save.load()).toEqual(current(data));
    const loaded = save.load()!; loaded.exploration.picked.push("wood_b"); expect(save.load()).toEqual(current(data));
  });

  it.each(["available", "active", "completed"])("accepts quest status %s and prior-day forage reset state", status => {
    const save = new SaveManager(new MemoryStorage()); const data = v6(); data.exploration = { ...defaults(1), forestQuest: status, carpenterQuest: status, lanternBuilt: status === "completed" };
    expect(save.save(data as any)).toBe(true); expect(save.load()).toEqual(current(data));
  });

  it("accepts exactly the nine stable resource nodes", () => {
    const save = new SaveManager(new MemoryStorage()); const data = v6(); data.exploration.picked = ["wood_a", "wood_b", "wood_c", "stone_a", "stone_b", "stone_c", "mushroom_a", "mushroom_b", "mushroom_c"];
    expect(save.save(data as any)).toBe(true); expect(save.load()?.exploration.picked).toEqual(data.exploration.picked);
  });

  const invalid: unknown[] = [null, [], {}, "active", { ...defaults(), extra: 1 }, { ...defaults(), forageDay: 0 }, { ...defaults(), forageDay: 7 }, { ...defaults(), forageDay: 1.5 }, { ...defaults(), forageDay: "6" }, { ...defaults(), picked: null }, { ...defaults(), picked: "wood_a" }, { ...defaults(), picked: ["wood_a", "wood_a"] }, { ...defaults(), picked: ["unknown"] }, { ...defaults(), picked: ["wood_a", 1] }, { ...defaults(), forestQuest: "finished" }, { ...defaults(), carpenterQuest: null }, { ...defaults(), lanternBuilt: 1 }, { ...defaults(), lanternBuilt: true }, { ...defaults(), carpenterQuest: "active", lanternBuilt: true }];
  const missing = ["forageDay", "picked", "forestQuest", "carpenterQuest", "lanternBuilt"].map(key => { const state: any = defaults(); delete state[key]; return state; });

  it.each([...invalid, ...missing].map(exploration => ({ exploration })))("rejects malformed raw V6 exploration without touching bytes %#", ({ exploration }) => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const raw = JSON.stringify({ ...v6(), exploration }); storage.set(SAVE_KEY, raw);
    expect(save.load()).toBeNull(); expect(save.save(v6() as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); expect(storage.get(SAVE_BACKUP_KEY)).toBeNull();
  });

  it.each([...invalid, ...missing].map(exploration => ({ exploration })))("rejects explicit invalid save-time exploration atomically %#", ({ exploration }) => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); expect(save.save(v6() as any)).toBe(true); const raw = storage.get(SAVE_KEY);
    expect(save.save({ ...v6(), exploration } as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); expect(storage.get(SAVE_BACKUP_KEY)).toBeNull();
  });

  it("defaults only omitted exploration for compatible partial callers, aligned to day", () => {
    const save = new SaveManager(new MemoryStorage()); expect(save.save({ gold: 10, day: 42 })).toBe(true); expect(save.load()?.exploration).toEqual(defaults(42));
    expect(save.save(v5())).toBe(true); expect(save.load()).toEqual(current());
  });

  it.each([1, 2, 3, 4, 5])("strictly migrates V%s without losing existing fields or raw backup bytes", version => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const legacy: any = v5(); legacy.version = version;
    if (version < 5) delete legacy.introQuest; if (version < 4) delete legacy.daily; if (version < 3) delete legacy.chest; if (version < 2) { delete legacy.inventory; delete legacy.farming; }
    const raw = JSON.stringify(legacy, null, 2); storage.set(SAVE_KEY, raw); const migrated = save.load()!;
    expect(migrated.version).toBe(SAVE_VERSION); expect(migrated.exploration).toEqual(defaults()); expect(migrated.gold).toBe(777); expect(migrated.day).toBe(6);
    if (version >= 2) { expect(migrated.inventory).toEqual(legacy.inventory); expect(migrated.farming).toEqual(legacy.farming); }
    if (version >= 3) expect(migrated.chest).toEqual(legacy.chest); if (version >= 4) expect(migrated.daily).toEqual(legacy.daily); if (version >= 5) expect(migrated.introQuest).toEqual(legacy.introQuest);
    expect(storage.get(SAVE_KEY)).toBe(raw); expect(save.save(migrated)).toBe(true); expect(storage.get(SAVE_BACKUP_KEY)).toBe(raw); expect(save.load()).toEqual(migrated);
    storage.set(SAVE_KEY, JSON.stringify({ ...legacy, exploration: defaults() })); expect(save.load()).toBeNull();
  });

  it("requires exploration for raw V6, rejects extra roots and keeps strict V5 validation", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const badBag = v5(); badBag.inventory.slots[0].itemId = "unknown";
    for (const data of [{ ...v5(), version: 6 }, { ...v6(), unexpected: 1 }, badBag, { ...v5(), introQuest: null }, { ...v5(), daily: { minute: 361, energy: 40 } }]) { storage.set(SAVE_KEY, JSON.stringify(data)); expect(save.load()).toBeNull(); }
  });

  it("preserves future V8 and exact legacy backup/rejected bytes during explicit recovery", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const future = JSON.stringify({ ...v6(), version: 8 }, null, 2); const backup = JSON.stringify(v5(), null, 2);
    storage.set(SAVE_KEY, future); storage.set(SAVE_BACKUP_KEY, backup); expect(save.load()).toBeNull(); expect(save.save(v6() as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(future); expect(storage.get(SAVE_BACKUP_KEY)).toBe(backup);
    expect(save.restoreBackup()).toBe(true); expect(storage.get(SAVE_RECOVERY_KEY)).toBe(future); expect(storage.get(SAVE_KEY)).toBe(backup); expect(save.load()).toEqual(current());
  });
});
