import { beforeEach, describe, expect, it } from "vitest";
import { initGameSession, getGameSession } from "../src/game/systems/GameSession";
import { DAYS_PER_SEASON } from "../src/domain/services/TimeService";
import { createLocalSaveManager, MemoryStorage } from "../src/persistence/save";

/** 会话层集成测试：验证跨场景共享的单一事实源行为 */
describe("GameSession", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    initGameSession(createLocalSaveManager(storage));
  });

  it("sleep 推进一天（持久化由调用方显式 saveGame 触发）", () => {
    const s = getGameSession();
    const before = s.time.date.day;
    s.sleep();
    expect(s.time.date.day).toBe(before + 1);
    expect(s.save.load()).toBeNull(); // sleep 本身不落盘
    s.saveGame();
    expect(s.save.load()?.day).toBe(before + 1);
  });

  it("loadGame 从存档恢复金币与日期", () => {
    const s = getGameSession();
    s.economy.addGold(999);
    for (let i = 0; i < DAYS_PER_SEASON; i++) s.sleep();
    s.saveGame();

    // 模拟“场景重建”：重置数值后读取存档
    s.economy.setGold(0);
    s.time.setDay(1);
    expect(s.loadGame()).toBe(true);
    expect(s.economy.goldValue).toBe(999);
    expect(s.time.date.day).toBe(DAYS_PER_SEASON + 1);
  });

  it("无存档时 loadGame 返回 false 且不改动状态", () => {
    const s = getGameSession();
    s.economy.addGold(50);
    expect(s.loadGame()).toBe(false);
    expect(s.economy.goldValue).toBe(50);
  });

  it("新游戏（clear）后 loadGame 不再恢复旧档", () => {
    const s = getGameSession();
    s.economy.addGold(300);
    s.saveGame();
    s.save.clear();
    expect(s.loadGame()).toBe(false);
  });
});
