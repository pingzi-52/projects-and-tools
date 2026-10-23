import { describe, it, expect } from "vitest";
import {
  initGameSession,
  INIT_GOLD,
  INIT_TOOLS,
} from "../src/game/systems/GameSession";
import {
  createLocalSaveManager,
  MemoryStorage,
} from "../src/persistence/save";

function makeSession(storage: MemoryStorage = new MemoryStorage()) {
  return {
    session: initGameSession(createLocalSaveManager(storage)),
    storage,
  };
}

// ────────────────────────────────────────────────
// newGame() 初始化
// ────────────────────────────────────────────────
describe("T4 子阶段1 - newGame() 初始化", () => {
  it("金币为 500", () => {
    const { session } = makeSession();
    session.newGame();
    expect(session.economy.goldValue).toBe(500);
    expect(INIT_GOLD).toBe(500);
  });

  it("背包含 hoe×1 与 watering_can×1", () => {
    const { session } = makeSession();
    session.newGame();
    expect(session.inventory.count("hoe")).toBe(1);
    expect(session.inventory.count("watering_can")).toBe(1);
    expect(INIT_TOOLS).toEqual(["hoe", "watering_can"]);
  });

  it("日期重置为第 1 天", () => {
    const { session } = makeSession();
    session.newGame();
    for (let i = 0; i < 4; i++) session.sleep();
    expect(session.time.date.day).toBe(5);
    session.newGame();
    expect(session.time.date.day).toBe(1);
  });

  it("清空旧农田状态", () => {
    const { session } = makeSession();
    session.newGame();
    const tillR = session.actions.till("0_0");
    expect(tillR.ok).toBe(true);
    expect(Object.keys(session.farming.serialize()).length).toBe(1);
    session.newGame();
    expect(Object.keys(session.farming.serialize()).length).toBe(0);
  });
});

// ────────────────────────────────────────────────
// 服务字段初始化
// ────────────────────────────────────────────────
describe("T4 子阶段1 - 服务字段初始化", () => {
  it("farming / crops / inventory / shop / weather / actions 均已初始化", () => {
    const { session } = makeSession();
    expect(session.farming).toBeDefined();
    expect(session.crops).toBeDefined();
    expect(session.inventory).toBeDefined();
    expect(session.shop).toBeDefined();
    expect(session.weather).toBeDefined();
    expect(session.actions).toBeDefined();
  });

  it("天气为晴天且 autoWater=false", () => {
    const { session } = makeSession();
    const w = session.weather.current();
    expect(w.type).toBe("sunny");
    expect(w.autoWater).toBe(false);
  });
});

// ────────────────────────────────────────────────
// sleep() 推进
// ────────────────────────────────────────────────
describe("T4 子阶段1 - sleep() 推进", () => {
  it("日期 +1", () => {
    const { session } = makeSession();
    session.newGame();
    const before = session.time.date.day;
    session.sleep();
    expect(session.time.date.day).toBe(before + 1);
  });

  it("已浇水作物 growthDay +1", () => {
    const { session } = makeSession();
    session.newGame();

    expect(session.inventory.add("dew_radish_seed", 1).ok).toBe(true);
    expect(session.actions.till("0_0").ok).toBe(true);
    expect(session.actions.plant("0_0", "dew_radish_seed").ok).toBe(true);
    expect(session.actions.water("0_0").ok).toBe(true);

    const before = session.farming.serialize()["0_0"].crop!.growthDay;
    expect(before).toBe(0);
    session.sleep();
    const after = session.farming.serialize()["0_0"].crop!.growthDay;
    expect(after).toBe(before + 1);
  });

  it("未浇水作物 growthDay 不变", () => {
    const { session } = makeSession();
    session.newGame();

    expect(session.inventory.add("dew_radish_seed", 1).ok).toBe(true);
    expect(session.actions.till("0_0").ok).toBe(true);
    expect(session.actions.plant("0_0", "dew_radish_seed").ok).toBe(true);
    // 不浇水

    const before = session.farming.serialize()["0_0"].crop!.growthDay;
    expect(before).toBe(0);
    session.sleep();
    const after = session.farming.serialize()["0_0"].crop!.growthDay;
    expect(after).toBe(before);
  });
});

// ────────────────────────────────────────────────
// 继续游戏：存档恢复
// ────────────────────────────────────────────────
describe("T4 子阶段1 - 继续游戏恢复存档", () => {
  it("从同一 MemoryStorage 重建 session，恢复金币 1234 / 第 7 天，loadGame() 返回 true", () => {
    const storage = new MemoryStorage();

    // ① 会话 A：写入明确状态并落盘
    const s1 = initGameSession(createLocalSaveManager(storage));
    s1.economy.setGold(1234);
    s1.time.setDay(7);
    s1.saveGame();

    // ② 会话 B：共享同一 storage
    const s2 = initGameSession(createLocalSaveManager(storage));

    const ok = s2.loadGame();
    expect(ok).toBe(true);
    expect(s2.economy.goldValue).toBe(1234);
    expect(s2.time.date.day).toBe(7);
  });
});

// ────────────────────────────────────────────────
// newGame() 不写盘
// ────────────────────────────────────────────────
describe("T4 子阶段1 - newGame() 不写盘", () => {
  it("调用 newGame() 前后 save.load() 持久化内容不变", () => {
    const storage = new MemoryStorage();

    // ① 写一个明确的旧档
    const s1 = initGameSession(createLocalSaveManager(storage));
    s1.economy.setGold(777);
    s1.time.setDay(9);
    s1.saveGame();

    // ② 新 session 共享 storage
    const s2 = initGameSession(createLocalSaveManager(storage));

    const persistedBefore = s2.save.load();
    expect(persistedBefore).not.toBeNull();
    expect(persistedBefore!.gold).toBe(777);
    expect(persistedBefore!.day).toBe(9);

    // ③ newGame 只改内存，不动持久化
    s2.newGame();

    const persistedAfter = s2.save.load();
    expect(persistedAfter).toEqual(persistedBefore);

    // ④ 内存里已是 newGame 状态
    expect(s2.economy.goldValue).toBe(500);
    expect(s2.time.date.day).toBe(1);
  });
});

// ────────────────────────────────────────────────
// clear + newGame 组合（TitleScene enterFarm 语义）
// ────────────────────────────────────────────────
describe("T4 子阶段1 - clear + newGame 组合", () => {
  it("save.clear() → newGame() 后 save.load() 为 null，loadGame() 返回 false", () => {
    const storage = new MemoryStorage();

    // ① 写旧档
    const s1 = initGameSession(createLocalSaveManager(storage));
    s1.economy.setGold(999);
    s1.time.setDay(11);
    s1.saveGame();
    expect(s1.save.load()).not.toBeNull();

    // ② 模拟 TitleScene enterFarm(fresh=true)
    const s2 = initGameSession(createLocalSaveManager(storage));
    s2.save.clear();
    s2.newGame();

    // ③ 持久化已清空
    expect(s2.save.load()).toBeNull();

    // ④ loadGame 返回 false
    const ok = s2.loadGame();
    expect(ok).toBe(false);

    // ⑤ 内存仍是 newGame 状态
    expect(s2.economy.goldValue).toBe(500);
    expect(s2.time.date.day).toBe(1);
  });
});
