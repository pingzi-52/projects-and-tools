import { describe, expect, it } from "vitest";
import { SAVE_KEY, SAVE_VERSION, type IntroQuestState } from "../src/domain/models/types";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY, SAVE_RECOVERY_KEY } from "../src/persistence/save";
import { CROPS } from "../src/data/crops";

const available = (): IntroQuestState => ({ status: "available", cropId: null });
const empty = () => ({ capacity: 24, slots: Array(24).fill(null) });
const v2 = () => ({ version: 2, gold: 777, day: 6, inventory: { capacity: 24, slots: [{ itemId: "dew_radish_seed", amount: 11 }, ...Array(23).fill(null)] }, farming: [{ id: "8_12", tilled: true, watered: true, crop: { cropId: "dew_radish", growthDay: 2, harvestedCount: 0 } }] });
const v3 = () => ({ ...v2(), version: 3, chest: { capacity: 24, slots: [{ itemId: "hoe", amount: 1 }, { itemId: "dew_radish", amount: 4 }, ...Array(22).fill(null)] } });
const v4 = () => ({ ...v3(), version: 4, daily: { minute: 820, energy: 47 } });
const v5 = (introQuest: IntroQuestState = available()) => ({ ...v4(), version: 5, introQuest });

const current = (data = v5()) => ({ ...data, version: SAVE_VERSION, fishingQuest: { status: "available" }, exploration: { forageDay: data.day, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false } });

describe("V5 persisted introduction quest", () => {
  it.each<IntroQuestState>([available(), { status: "active", cropId: "dew_radish" }, { status: "completed", cropId: "starberry" }])("round-trips $status alongside the complete existing farm", introQuest => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const data = v5(introQuest);
    expect(SAVE_VERSION).toBe(7); expect(save.save(data)).toBe(true); expect(save.load()).toEqual(current(data)); expect(JSON.parse(storage.get(SAVE_KEY)!)).toEqual(current(data));
  });

  it.each(CROPS.flatMap(crop => (["active", "completed"] as const).map(status => ({ status, cropId: crop.id }))))("accepts known crop $cropId for $status", introQuest => {
    const save = new SaveManager(new MemoryStorage()); expect(save.save(v5(introQuest))).toBe(true); expect(save.load()?.introQuest).toEqual(introQuest);
  });

  it("keeps legacy partial save callers and allows a standalone explicit quest", () => {
    const save = new SaveManager(new MemoryStorage());
    expect(save.save({ gold: 123, day: 2 })).toBe(true); expect(save.load()?.introQuest).toEqual(available());
    expect(save.save(v4())).toBe(true); expect(save.load()).toEqual(current());
    const introQuest: IntroQuestState = { status: "active", cropId: "blue_melon" };
    expect(save.save({ gold: 35, day: 18, introQuest })).toBe(true); expect(save.load()?.introQuest).toEqual(introQuest);
  });

  const invalidQuest: unknown[] = [null, [], {}, "active", { status: "missing", cropId: null },
    { status: "available", cropId: "dew_radish" }, { status: "available" }, { cropId: null },
    { status: "active", cropId: null }, { status: "completed", cropId: null },
    { status: "active", cropId: "unknown" }, { status: "completed", cropId: "dew_radish_seed" },
    { status: "active", cropId: 0 }, { status: "completed", cropId: "" },
    { status: "available", cropId: null, reward: 1 }, { status: "active", cropId: "starberry", extra: true }];

  it.each(invalidQuest.map(introQuest => ({ introQuest })))("rejects malformed quest on load and preserves primary %#", ({ introQuest }) => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const raw = JSON.stringify({ ...v5(), introQuest }); storage.set(SAVE_KEY, raw);
    expect(save.load()).toBeNull(); expect(save.save(v5())).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); expect(storage.get(SAVE_BACKUP_KEY)).toBeNull();
  });

  it.each(invalidQuest.map(introQuest => ({ introQuest })))("rejects malformed quest on save without replacing valid bytes %#", ({ introQuest }) => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); expect(save.save(v5())).toBe(true); const raw = storage.get(SAVE_KEY);
    expect(save.save({ ...v5(), introQuest: introQuest as IntroQuestState })).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); expect(storage.get(SAVE_BACKUP_KEY)).toBeNull();
  });

  it("requires a quest and exact root fields for raw V5", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage);
    for (const data of [{ ...v4(), version: 5 }, { ...v5(), surprise: true }]) { storage.set(SAVE_KEY, JSON.stringify(data)); expect(save.load()).toBeNull(); }
  });
});

describe("V1 through V4 migration and raw backup protection", () => {
  it.each([1, 2, 3, 4])("migrates V%s without losing preexisting state and backs up exact original text", version => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage);
    const legacy = version === 1 ? { version: 1, gold: 777, day: 6 } : version === 2 ? v2() : version === 3 ? v3() : v4();
    const raw = JSON.stringify(legacy, null, 2); storage.set(SAVE_KEY, raw);
    const migrated = save.load(); expect(migrated?.version).toBe(SAVE_VERSION); expect(migrated?.introQuest).toEqual(available()); expect(migrated?.gold).toBe(777); expect(migrated?.day).toBe(6);
    expect(migrated?.farming).toEqual(version === 1 ? [] : v2().farming);
    if (version >= 2) expect(migrated?.inventory).toEqual(v2().inventory);
    else expect(migrated?.inventory.slots.slice(0, 2)).toEqual([{ itemId: "hoe", amount: 1 }, { itemId: "watering_can", amount: 1 }]);
    expect(migrated?.chest).toEqual(version >= 3 ? v3().chest : empty()); expect(migrated?.daily).toEqual(version === 4 ? v4().daily : { minute: 360, energy: 100 });
    expect(storage.get(SAVE_KEY)).toBe(raw); expect(save.save(migrated!)).toBe(true); expect(storage.get(SAVE_BACKUP_KEY)).toBe(raw); expect(save.load()).toEqual(migrated);
  });

  it.each([1, 2, 3, 4])("rejects a quest smuggled into old V%s schema", version => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const legacy = version === 1 ? { version: 1, gold: 1, day: 1 } : version === 2 ? v2() : version === 3 ? v3() : v4();
    storage.set(SAVE_KEY, JSON.stringify({ ...legacy, introQuest: available() })); expect(save.load()).toBeNull();
  });

  it("still validates V4 daily, farming and inventory before quest migration", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage);
    const badDaily = { ...v4(), daily: { minute: 821, energy: 47 } };
    const badBag = v4(); badBag.inventory.slots[0] = { itemId: "unknown", amount: 1 };
    const badFarm = v4(); badFarm.farming.push(badFarm.farming[0]);
    for (const data of [badDaily, badBag, badFarm]) { storage.set(SAVE_KEY, JSON.stringify(data)); expect(save.load()).toBeNull(); }
  });

  it("protects future V8 and restores a raw V4 backup without discarding rejected bytes", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const future = JSON.stringify({ ...v5(), version: 8 }); const backup = JSON.stringify(v4(), null, 2);
    storage.set(SAVE_KEY, future); storage.set(SAVE_BACKUP_KEY, backup);
    expect(save.load()).toBeNull(); expect(save.save(v5())).toBe(false); expect(storage.get(SAVE_KEY)).toBe(future); expect(storage.get(SAVE_BACKUP_KEY)).toBe(backup);
    expect(save.restoreBackup()).toBe(true); expect(storage.get(SAVE_RECOVERY_KEY)).toBe(future); expect(storage.get(SAVE_KEY)).toBe(backup); expect(save.load()).toEqual(current());
  });
});
