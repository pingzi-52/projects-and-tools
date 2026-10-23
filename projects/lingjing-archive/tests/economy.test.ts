import { describe, expect, it } from "vitest";
import { EconomyService } from "../src/domain/services/EconomyService";

describe("EconomyService", () => {
  it("初始金币为 0", () => {
    const e = new EconomyService();
    expect(e.goldValue).toBe(0);
  });

  it("addGold 累加，结果不低于 0", () => {
    const e = new EconomyService(10);
    expect(e.addGold(5)).toBe(15);
    expect(e.addGold(-1000)).toBe(0);
  });

  it("spendGold 余额不足时失败且不扣款", () => {
    const e = new EconomyService(5);
    expect(e.spendGold(10)).toBe(false);
    expect(e.goldValue).toBe(5);
  });

  it("spendGold 成功时扣款", () => {
    const e = new EconomyService(50);
    expect(e.spendGold(30)).toBe(true);
    expect(e.goldValue).toBe(20);
  });

  it("spendGold 对 0 / 负数无操作", () => {
    const e = new EconomyService(10);
    expect(e.spendGold(0)).toBe(false);
    expect(e.spendGold(-5)).toBe(false);
    expect(e.goldValue).toBe(10);
  });

  it("金币值取整", () => {
    const e = new EconomyService();
    e.addGold(2.6);
    expect(e.goldValue).toBe(3);
  });
});
