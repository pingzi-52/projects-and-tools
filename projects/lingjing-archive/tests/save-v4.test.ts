import { describe, expect, it } from "vitest";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY, SAVE_RECOVERY_KEY } from "../src/persistence/save";

const empty = () => ({ capacity: 24, slots: Array(24).fill(null) });
const v2 = () => ({ version: 2, gold: 777, day: 6, inventory: { capacity: 24, slots: [{ itemId: "dew_radish_seed", amount: 11 }, ...Array(23).fill(null)] }, farming: [{ id: "8_12", tilled: true, watered: true, crop: { cropId: "dew_radish", growthDay: 2, harvestedCount: 0 } }] });
const v3 = () => ({ ...v2(), version: 3, chest: { capacity: 24, slots: [{ itemId: "hoe", amount: 1 }, { itemId: "dew_radish", amount: 4 }, ...Array(22).fill(null)] } });
const v4 = () => ({ ...v3(), version: 4, daily: { minute: 820, energy: 47 } });
const questDefault = { status: "available", cropId: null };

describe("V4 daily state persistence", () => {
  it("round-trips all fields with daily state", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const data = v4();
    expect(save.save(data)).toBe(true); expect(save.load()).toEqual({ ...data, version: SAVE_VERSION, fishingQuest: { status: "available" }, introQuest: questDefault, exploration: { forageDay: 6, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false } });
    expect(JSON.parse(storage.get(SAVE_KEY)!)).toEqual({ ...data, version: SAVE_VERSION, fishingQuest: { status: "available" }, introQuest: questDefault, exploration: { forageDay: 6, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false } });
  });

  it.each([{ minute: 360, energy: 100 }, { minute: 1320, energy: 0 }, { minute: 1310, energy: 1 }, { minute: 370, energy: 99 }])("accepts exact daily boundaries $minute/$energy", daily => {
    const save = new SaveManager(new MemoryStorage()); expect(save.save({ ...v4(), daily })).toBe(true); expect(save.load()?.daily).toEqual(daily);
  });

  it("keeps compatible gold/day-only and full old-field save callers", () => {
    const save = new SaveManager(new MemoryStorage());
    expect(save.save({ gold: 50, day: 2 })).toBe(true); expect(save.load()?.daily).toEqual({ minute: 360, energy: 100 });
    expect(save.save(v3())).toBe(true); expect(save.load()).toEqual({ ...v3(), version: SAVE_VERSION, fishingQuest: { status: "available" }, daily: { minute: 360, energy: 100 }, introQuest: questDefault, exploration: { forageDay: 6, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false } });
    expect(save.save({ gold: 60, day: 3, daily: { minute: 600, energy: 80 } })).toBe(true);
    expect(save.load()?.daily).toEqual({ minute: 600, energy: 80 });
  });

  it.each([
    (d: any) => { delete d.daily; },
    (d: any) => { d.daily = null; },
    (d: any) => { d.daily = []; },
    (d: any) => { delete d.daily.minute; },
    (d: any) => { delete d.daily.energy; },
    (d: any) => { d.daily.extra = 1; },
    (d: any) => { d.daily.minute = 350; },
    (d: any) => { d.daily.minute = 1330; },
    (d: any) => { d.daily.minute = 361; },
    (d: any) => { d.daily.minute = 360.5; },
    (d: any) => { d.daily.minute = NaN; },
    (d: any) => { d.daily.minute = Infinity; },
    (d: any) => { d.daily.minute = "360"; },
    (d: any) => { d.daily.energy = -1; },
    (d: any) => { d.daily.energy = 101; },
    (d: any) => { d.daily.energy = 0.5; },
    (d: any) => { d.daily.energy = NaN; },
    (d: any) => { d.daily.energy = "100"; },
  ])("rejects malformed V4 daily on load without replacing raw primary #%#", mutate => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const data = v4(); mutate(data); const raw = JSON.stringify(data); storage.set(SAVE_KEY, raw);
    expect(save.load()).toBeNull(); expect(save.hasStoredData()).toBe(true);
    expect(save.save(v4())).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); expect(storage.get(SAVE_BACKUP_KEY)).toBeNull();
  });

  it.each([
    { minute: 360, energy: -1 }, { minute: 361, energy: 100 }, { minute: 1321, energy: 100 },
    { minute: 360.5, energy: 100 }, { minute: 360, energy: 100.5 }, { minute: NaN, energy: 100 },
    { minute: Infinity, energy: 100 },
  ])("rejects invalid save-time daily without touching valid save $minute/$energy", daily => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); expect(save.save(v4())).toBe(true); const raw = storage.get(SAVE_KEY);
    expect(save.save({ ...v4(), daily })).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
});

describe("V1/V2/V3 strict migration to V4", () => {
  it.each([1, 2, 3])("migrates V%s and preserves original raw bytes as upgrade backup", version => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage);
    const legacy = version === 1 ? { version: 1, gold: 777, day: 6 } : version === 2 ? v2() : v3(); const raw = JSON.stringify(legacy); storage.set(SAVE_KEY, raw);
    const upgraded = save.load(); expect(upgraded?.version).toBe(SAVE_VERSION); expect(upgraded?.daily).toEqual({ minute: 360, energy: 100 });
    expect(upgraded?.gold).toBe(777); expect(upgraded?.day).toBe(6); expect(storage.get(SAVE_KEY)).toBe(raw);
    if (version >= 2) { expect(upgraded?.inventory).toEqual(v2().inventory); expect(upgraded?.farming).toEqual(v2().farming); }
    else { expect(upgraded?.inventory.slots.slice(0, 2)).toEqual([{ itemId: "hoe", amount: 1 }, { itemId: "watering_can", amount: 1 }]); expect(upgraded?.farming).toEqual([]); }
    expect(upgraded?.chest).toEqual(version === 3 ? v3().chest : empty());
    expect(save.save(upgraded!)).toBe(true); expect(storage.get(SAVE_BACKUP_KEY)).toBe(raw); expect(JSON.parse(storage.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
  });

  it.each([1, 2, 3])("refuses hidden daily and extra fields in V%s", version => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const legacy = version === 1 ? { version: 1, gold: 1, day: 1 } : version === 2 ? v2() : v3();
    for (const data of [{ ...legacy, daily: { minute: 360, energy: 100 } }, { ...legacy, unexpected: 1 }]) {
      storage.set(SAVE_KEY, JSON.stringify(data)); expect(save.load()).toBeNull();
    }
  });

  it("validates V3 chest and farming before adding default daily", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const data = v3(); data.chest.slots[0] = { itemId: "unknown", amount: 1 };
    storage.set(SAVE_KEY, JSON.stringify(data)); expect(save.load()).toBeNull();
    const invalidFarm = v3(); invalidFarm.farming.push(invalidFarm.farming[0]); storage.set(SAVE_KEY, JSON.stringify(invalidFarm)); expect(save.load()).toBeNull();
  });

  it("protects future version and explicitly restores validated legacy backup", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const future = JSON.stringify({ ...v4(), version: SAVE_VERSION + 1 }); const backup = JSON.stringify(v3());
    storage.set(SAVE_KEY, future); storage.set(SAVE_BACKUP_KEY, backup);
    expect(save.load()).toBeNull(); expect(save.save(v4())).toBe(false); expect(storage.get(SAVE_KEY)).toBe(future); expect(storage.get(SAVE_BACKUP_KEY)).toBe(backup);
    expect(save.restoreBackup()).toBe(true); expect(storage.get(SAVE_RECOVERY_KEY)).toBe(future); expect(storage.get(SAVE_KEY)).toBe(backup);
    expect(save.load()).toEqual({ ...v3(), version: SAVE_VERSION, fishingQuest: { status: "available" }, daily: { minute: 360, energy: 100 }, introQuest: questDefault, exploration: { forageDay: 6, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false } });
  });
});
