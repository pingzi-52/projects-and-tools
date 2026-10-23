import { describe, expect, it } from "vitest";
import { initGameSession } from "../src/game/systems/GameSession";
import { createLocalSaveManager, MemoryStorage } from "../src/persistence/save";

function fresh(storage: MemoryStorage = new MemoryStorage()) {
  const session = initGameSession(createLocalSaveManager(storage));
  session.newGame();
  return session;
}

describe("daily session action boundaries", () => {
  it("charges only successful new hoe/water/plant and makes repeated work free", () => {
    const s = fresh();
    expect(s.actions.till("8_12").ok).toBe(true); expect(s.life.energy).toBe(98);
    expect(s.actions.till("8_12").ok).toBe(true); expect(s.life.energy).toBe(98);
    expect(s.actions.water("8_12").ok).toBe(true); expect(s.life.energy).toBe(96);
    expect(s.actions.water("8_12").ok).toBe(true); expect(s.life.energy).toBe(96);
    s.inventory.add("dew_radish_seed", 2);
    expect(s.actions.plant("8_12", "dew_radish_seed").ok).toBe(true); expect(s.life.energy).toBe(95);
    expect(s.actions.plant("8_12", "dew_radish_seed").ok).toBe(false);
    expect(s.life.energy).toBe(95); expect(s.inventory.count("dew_radish_seed")).toBe(1);
    expect(s.actions.water("8_13").ok).toBe(false); expect(s.life.energy).toBe(95);
  });
  it("rejects tired work before mutating farmland or losing seeds", () => {
    const s = fresh();
    s.actions.till("8_12"); s.inventory.add("dew_radish_seed", 1);
    s.life.spend(98);
    const before = s.farming.serialize();
    for (const result of [s.actions.till("8_13"), s.actions.water("8_12"), s.actions.plant("8_12", "dew_radish_seed")]) {
      expect(result).toEqual({ ok: false, reason: "TOO_TIRED" });
    }
    expect(s.farming.serialize()).toEqual(before);
    expect(s.inventory.count("dew_radish_seed")).toBe(1); expect(s.life.energy).toBe(0);
    expect(s.actions.till("8_12").ok).toBe(true);
    expect(s.time.date.day).toBe(1);
    s.sleep(); expect(s.life.serialize()).toEqual({ minute: 360, energy: 100 });
  });
  it("allows harvest with zero energy and leaves date/clock persistence explicit", () => {
    const s = fresh();
    s.farming.restore({ "8_12": { id: "8_12", tilled: true, watered: false,
      crop: { cropId: "dew_radish", growthDay: 4, harvestedCount: 0 } } });
    s.life.spend(100);
    expect(s.actions.harvest("8_12").ok).toBe(true); expect(s.life.energy).toBe(0);
    expect(s.inventory.count("dew_radish")).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) expect(s.advanceTime(1000)).toBe(false);
    expect(s.advanceTime(1000)).toBe(true); expect(s.life.clockText).toBe("06:10");
    expect(s.save.load()).toBeNull();
  });
});

describe("departure weather, morning rain and complete daily restore", () => {
  it("does not borrow tomorrow's rain for growth, then grows using the day being left", () => {
    const s = fresh();
    s.actions.till("8_12"); s.inventory.add("dew_radish_seed", 1); s.actions.plant("8_12", "dew_radish_seed");
    s.sleep(); // 1 sunny -> 2 cloudy
    expect(s.farming.serialize()["8_12"].crop?.growthDay).toBe(0);
    s.sleep(); // 2 cloudy -> 3 rain
    expect(s.farming.serialize()["8_12"].crop?.growthDay).toBe(0);
    expect(s.farming.serialize()["8_12"].watered).toBe(true);
    expect(s.weather.current()).toEqual({ type: "rain", autoWater: true });
    s.sleep(); // 3 rain -> 4 sunny
    expect(s.farming.serialize()["8_12"].crop?.growthDay).toBe(1);
    expect(s.farming.serialize()["8_12"].watered).toBe(false);
    expect(s.weather.current().type).toBe("sunny");
  });
  it("automatically waters newly tilled rainy ground without charging additional energy", () => {
    const s = fresh(); s.sleep(); s.sleep();
    expect(s.actions.till("8_12").ok).toBe(true); expect(s.life.energy).toBe(98);
    expect(s.farming.serialize()["8_12"].watered).toBe(true);
    s.life.spend(98);
    expect(s.actions.water("8_12").ok).toBe(true); expect(s.life.energy).toBe(0);
  });
  it("restores clock, energy, inventories and rain watering without growing a crop", () => {
    const storage = new MemoryStorage(); const s = fresh(storage);
    s.sleep(); s.sleep();
    s.farming.restore({ "8_12": { id: "8_12", tilled: true, watered: false,
      crop: { cropId: "dew_radish", growthDay: 1, harvestedCount: 0 } } });
    s.inventory.add("dew_radish_seed", 2); s.chest.add("starberry_seed", 3);
    s.life.restore({ minute: 550, energy: 17 });
    expect(s.saveGame()).toBe(true);
    const reloaded = fresh(storage);
    const lifeRef = reloaded.life, inventoryRef = reloaded.inventory, farmingRef = reloaded.farming;
    expect(reloaded.loadGame()).toBe(true);
    expect(reloaded.life).toBe(lifeRef); expect(reloaded.inventory).toBe(inventoryRef); expect(reloaded.farming).toBe(farmingRef);
    expect(reloaded.life.serialize()).toEqual({ minute: 550, energy: 17 });
    expect(reloaded.farming.serialize()["8_12"].watered).toBe(true);
    expect(reloaded.farming.serialize()["8_12"].crop?.growthDay).toBe(1);
    expect(reloaded.inventory.count("dew_radish_seed")).toBe(2);
    expect(reloaded.chest.count("starberry_seed")).toBe(3);
    reloaded.newGame(); expect(reloaded.life.serialize()).toEqual({ minute: 360, energy: 100 });
    expect(reloaded.farming.serialize()).toEqual({}); expect(reloaded.chest.count("starberry_seed")).toBe(0);
  });
  it("does not change energy on failing persistent trade/chest operations", () => {
    class FaultStorage extends MemoryStorage {
      fail = false;
      override set(key: string, value: string): void { if (this.fail) throw new Error("full"); super.set(key, value); }
    }
    const storage = new FaultStorage(); const s = fresh(storage);
    s.actions.till("8_12"); s.inventory.add("dew_radish_seed", 1);
    expect(s.saveGame()).toBe(true);
    const daily = s.life.serialize(), inventory = s.inventory.serialize(), gold = s.economy.goldValue;
    storage.fail = true;
    expect(s.buyItem("dew_radish_seed", 1)).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.transferChest("dew_radish_seed", 1, "deposit")).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.life.serialize()).toEqual(daily); expect(s.inventory.serialize()).toEqual(inventory);
    expect(s.economy.goldValue).toBe(gold); expect(s.chest.count("dew_radish_seed")).toBe(0);
  });
});
