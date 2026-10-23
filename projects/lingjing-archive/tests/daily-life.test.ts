import { describe, expect, it } from "vitest";
import { DailyLifeService, weatherForDay } from "../src/domain/services/DailyLifeService";

describe("daily clock and energy", () => {
  it("starts at 06:00 with full energy and only changes clock after seven seconds", () => {
    const life = new DailyLifeService();
    expect(life.serialize()).toEqual({ minute: 360, energy: 100 });
    expect(life.clockText).toBe("06:00");
    for (let i = 0; i < 6; i++) expect(life.advance(1000)).toBe(false);
    expect(life.advance(1000)).toBe(true);
    expect(life.clockText).toBe("06:10");
  });
  it("clamps a background frame and ignores invalid delta", () => {
    const life = new DailyLifeService();
    for (const delta of [NaN, Infinity, -Infinity, -100, 0]) expect(life.advance(delta)).toBe(false);
    expect(life.advance(600000)).toBe(false);
    for (let i = 0; i < 5; i++) expect(life.advance(1000)).toBe(false);
    expect(life.advance(1000)).toBe(true);
    expect(life.minute).toBe(370);
  });
  it("stops at 22:00 without advancing the date or losing energy", () => {
    const life = new DailyLifeService();
    life.restore({ minute: 1310, energy: 45 });
    for (let i = 0; i < 7; i++) life.advance(1000);
    expect(life.minute).toBe(1320); expect(life.clockText).toBe("22:00");
    expect(life.isLate).toBe(true); expect(life.advance(1000)).toBe(false);
    expect(life.energy).toBe(45);
  });
  it("allows free actions at zero and rejects invalid or unaffordable costs atomically", () => {
    const life = new DailyLifeService();
    expect(life.spend(100)).toBe(true);
    expect(life.canSpend(0)).toBe(true); expect(life.spend(0)).toBe(true);
    for (const cost of [1, -1, 0.5, Infinity, NaN]) {
      expect(life.canSpend(cost)).toBe(false); expect(life.spend(cost)).toBe(false);
      expect(life.energy).toBe(0);
    }
  });
  it("restores only validated state, resets fractional clock progress, and resets mornings", () => {
    const life = new DailyLifeService();
    for (let i = 0; i < 6; i++) life.advance(1000);
    life.restore({ minute: 550, energy: 17 });
    expect(life.clockText).toBe("09:10"); expect(life.advance(1000)).toBe(false);
    const snapshot = life.serialize(); snapshot.energy = 100;
    expect(life.energy).toBe(17);
    for (const state of [{ minute: 371, energy: 10 }, { minute: 359, energy: 10 }, { minute: 1321, energy: 10 },
      { minute: 360.5, energy: 10 }, { minute: 360, energy: -1 }, { minute: 360, energy: 101 }]) {
      expect(() => life.restore(state)).toThrow(RangeError);
      expect(life.serialize()).toEqual({ minute: 550, energy: 17 });
    }
    life.resetMorning(); expect(life.serialize()).toEqual({ minute: 360, energy: 100 });
    expect(life.advance(1000)).toBe(false);
  });
});

describe("deterministic local weather", () => {
  it("follows the exact seven-day cycle without changing across calls or years", () => {
    const expected = ["sunny", "cloudy", "rain", "sunny", "sunny", "rain", "cloudy"];
    expected.forEach((type, index) => {
      expect(weatherForDay(index + 1, "spring")).toEqual({ type, autoWater: type === "rain" });
      expect(weatherForDay(index + 8, "spring")).toEqual(weatherForDay(index + 1, "spring"));
      expect(weatherForDay(index + 57, "spring")).toEqual(weatherForDay(index + 1, "spring"));
    });
  });
  it("turns winter rain into cloudy weather and rejects invalid days", () => {
    for (const day of [3, 6, 45, 48]) expect(weatherForDay(day, "winter")).toEqual({ type: "cloudy", autoWater: false });
    for (const day of [0, -1, 1.5, NaN]) expect(() => weatherForDay(day, "spring")).toThrow(RangeError);
  });
});
