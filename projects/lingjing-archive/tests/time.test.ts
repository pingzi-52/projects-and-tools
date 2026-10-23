import { describe, expect, it } from "vitest";
import { DAYS_PER_SEASON, TimeService } from "../src/domain/services/TimeService";

describe("TimeService", () => {
  it("初始为第 1 天，春季", () => {
    const t = new TimeService();
    expect(t.date).toEqual({ day: 1, season: "spring" });
  });

  it("每天推进一天", () => {
    const t = new TimeService();
    for (let i = 0; i < 3; i++) t.advanceDay();
    expect(t.date.day).toBe(4);
  });

  it(`第 ${DAYS_PER_SEASON} 天为季末，第 ${DAYS_PER_SEASON + 1} 天进入下一季`, () => {
    const t = new TimeService();
    for (let i = 0; i < DAYS_PER_SEASON - 1; i++) t.advanceDay();
    expect(t.date).toEqual({ day: DAYS_PER_SEASON, season: "spring" });
    t.advanceDay();
    expect(t.date).toEqual({ day: DAYS_PER_SEASON + 1, season: "summer" });
  });

  it("季节按 春→夏→秋→冬 循环", () => {
    const t = new TimeService();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(t.date.season);
      for (let d = 0; d < DAYS_PER_SEASON; d++) t.advanceDay();
    }
    expect(seen).toEqual(["spring", "summer", "autumn", "winter"]);
  });

  it("一年后回到春季", () => {
    const t = new TimeService();
    for (let i = 0; i < 4 * DAYS_PER_SEASON; i++) t.advanceDay();
    expect(t.date).toEqual({ day: 4 * DAYS_PER_SEASON + 1, season: "spring" });
  });

  it("setDay 不允许小于 1", () => {
    const t = new TimeService();
    t.setDay(0);
    expect(t.date.day).toBe(1);
  });
});
