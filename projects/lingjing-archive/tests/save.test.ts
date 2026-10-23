import { describe, expect, it } from "vitest";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";
import {
  MemoryStorage,
  SaveManager,
  createLocalSaveManager,
} from "../src/persistence/save";

describe("SaveManager（内存存储）", () => {
  const make = () => createLocalSaveManager(new MemoryStorage());

  it("save 后 load 返回相同数据", () => {
    const s = make();
    s.save({ gold: 120, day: 7 });
    expect(s.load()).toMatchObject({ version: SAVE_VERSION, gold: 120, day: 7, farming: [], inventory: { capacity: 24 }, chest: { capacity: 24, slots: Array(24).fill(null) }, daily: { minute: 360, energy: 100 }, introQuest: { status: "available", cropId: null } });
  });

  it("无存档时 load 返回 null", () => {
    const s = make();
    expect(s.load()).toBeNull();
  });

  it("clear 后 load 返回 null", () => {
    const s = make();
    s.save({ gold: 1, day: 1 });
    s.clear();
    expect(s.load()).toBeNull();
  });

  it("损坏的 JSON 返回 null（不抛错）", () => {
    const storage = new MemoryStorage();
    storage.set(SAVE_KEY, "{not json");
    const s = new SaveManager(storage);
    expect(s.load()).toBeNull();
  });

  it("字段类型不对返回 null", () => {
    const storage = new MemoryStorage();
    storage.set(SAVE_KEY, JSON.stringify({ gold: "x", day: 1 }));
    const s = new SaveManager(storage);
    expect(s.load()).toBeNull();
  });
});
