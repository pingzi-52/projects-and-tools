import { describe, expect, it } from "vitest";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY, SAVE_RECOVERY_KEY } from "../src/persistence/save";
const empty = () => ({ capacity: 24, slots: Array(24).fill(null) });
const v6 = () => ({ version: 6, gold: 777, day: 6, inventory: { capacity: 24, slots: [{ itemId: "sun_carp", amount: 2 }, ...Array(23).fill(null)] }, chest: empty(), farming: [], daily: { minute: 820, energy: 47 }, introQuest: { status: "active", cropId: "dew_radish" }, exploration: { forageDay: 6, picked: ["wood_a"], forestQuest: "active", carpenterQuest: "available", lanternBuilt: false } });
const v7 = () => ({ ...v6(), version: 7, fishingQuest: { status: "available" } });

describe("V7 first fishing quest persistence", () => {
  it.each(["available", "active", "completed"])("round trips %s alongside complete state", status => {
    const storage = new MemoryStorage(), save = new SaveManager(storage), data = { ...v7(), fishingQuest: { status } };
    expect(SAVE_VERSION).toBe(7); expect(save.save(data as any)).toBe(true); expect(save.load()).toEqual(data); expect(JSON.parse(storage.get(SAVE_KEY)!)).toEqual(data);
  });
  it.each([null, [], {}, "active", { status: 1 }, { status: "finished" }, { status: "active", reward: 60 }])("rejects corrupt quest on load and save atomically %#", fishingQuest => {
    const storage = new MemoryStorage(), save = new SaveManager(storage); save.save(v7() as any); const before = storage.get(SAVE_KEY);
    expect(save.save({ ...v7(), fishingQuest } as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(before); expect(storage.get(SAVE_BACKUP_KEY)).toBeNull();
    const raw = JSON.stringify({ ...v7(), fishingQuest }); storage.set(SAVE_KEY, raw); expect(save.load()).toBeNull(); expect(save.save(v7() as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
  it("requires exact V7 root and rejects new field smuggled into literal V6", () => {
    const storage = new MemoryStorage(), save = new SaveManager(storage), missing: any = v7(); delete missing.fishingQuest;
    for (const data of [missing, { ...v7(), extra: 1 }, { ...v6(), fishingQuest: { status: "active" } }, { ...v6(), exploration: { ...v6().exploration, extra: 1 } }]) { storage.set(SAVE_KEY, JSON.stringify(data)); expect(save.load()).toBeNull(); }
  });
  it.each([1, 2, 3, 4, 5, 6])("migrates strict historical V%s to available without changing original bytes", version => {
    const storage = new MemoryStorage(), save = new SaveManager(storage), old: any = v6(); old.version = version;
    if (version < 6) delete old.exploration; if (version < 5) delete old.introQuest; if (version < 4) delete old.daily; if (version < 3) delete old.chest; if (version < 2) { delete old.inventory; delete old.farming; }
    const raw = JSON.stringify(old, null, 2); storage.set(SAVE_KEY, raw); const migrated = save.load()!;
    expect(migrated.version).toBe(7); expect(migrated.fishingQuest).toEqual({ status: "available" }); expect(migrated.gold).toBe(777); expect(migrated.day).toBe(6);
    for (const key of ["inventory", "farming", "chest", "daily", "introQuest", "exploration"] as const) if (key in old) expect(migrated[key]).toEqual(old[key]);
    expect(storage.get(SAVE_KEY)).toBe(raw); expect(save.save(migrated)).toBe(true); expect(storage.get(SAVE_BACKUP_KEY)).toBe(raw); expect(save.load()).toEqual(migrated);
    storage.set(SAVE_KEY, JSON.stringify({ ...old, fishingQuest: { status: "available" } })); expect(save.load()).toBeNull();
  });
  it("protects future V8 and preserves exact raw V6 backup and rejected bytes", () => {
    const storage = new MemoryStorage(), save = new SaveManager(storage), future = JSON.stringify({ ...v7(), version: 8 }), old = JSON.stringify(v6(), null, 2);
    storage.set(SAVE_KEY, future); storage.set(SAVE_BACKUP_KEY, old); expect(save.load()).toBeNull(); expect(save.save(v7() as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(future);
    expect(save.restoreBackup()).toBe(true); expect(storage.get(SAVE_RECOVERY_KEY)).toBe(future); expect(storage.get(SAVE_KEY)).toBe(old); expect(save.load()).toEqual({ ...v6(), version: 7, fishingQuest: { status: "available" } });
  });
});
