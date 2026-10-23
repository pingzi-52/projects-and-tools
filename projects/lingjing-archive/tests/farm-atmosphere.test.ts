import { describe, expect, it } from "vitest";
import { lightingForMinute } from "../src/game/systems/farmAtmosphere";

describe("farm atmosphere lighting", () => {
  it("keeps the working day clear and warms gradually toward evening", () => {
    expect(lightingForMinute(360).alpha).toBeCloseTo(0.06);
    expect(lightingForMinute(420).alpha).toBe(0);
    expect(lightingForMinute(720).alpha).toBe(0);
    expect(lightingForMinute(1020).alpha).toBe(0);
    expect(lightingForMinute(1080).alpha).toBeCloseTo(0.06);
    expect(lightingForMinute(1140).alpha).toBeCloseTo(0.12);
  });
  it("moves from warm dusk to soft blue night with readable darkness", () => {
    expect(lightingForMinute(1320).color).toBe(0x34476f);
    expect(lightingForMinute(1320).alpha).toBeCloseTo(0.33);
    expect(lightingForMinute(1230).alpha).toBeGreaterThan(lightingForMinute(1140).alpha);
    expect(lightingForMinute(1230).color).not.toBe(lightingForMinute(1140).color);
    // The dusk/night junction stays continuous instead of flashing between tones.
    expect(lightingForMinute(1140.001).alpha - lightingForMinute(1140).alpha).toBeLessThan(0.001);
  });
  it("keeps indoors warm and limits even late-night tint to twelve percent", () => {
    expect(lightingForMinute(1320, true).alpha).toBeCloseTo(0.12);
    expect(lightingForMinute(1320, true).color).toBe(lightingForMinute(360, true).color);
    for (let minute = 360; minute <= 1320; minute += 10) {
      const indoor = lightingForMinute(minute, true), outdoor = lightingForMinute(minute);
      expect(indoor.alpha).toBeGreaterThanOrEqual(0);
      expect(indoor.alpha).toBeLessThanOrEqual(0.12);
      expect(outdoor.alpha).toBeGreaterThanOrEqual(0);
      expect(outdoor.alpha).toBeLessThanOrEqual(0.35);
    }
  });
  it("clamps out-of-day times and safely handles non-finite input", () => {
    expect(lightingForMinute(-1)).toEqual(lightingForMinute(360));
    expect(lightingForMinute(1440)).toEqual(lightingForMinute(1320));
    for (const minute of [NaN, Infinity, -Infinity]) {
      expect(lightingForMinute(minute)).toEqual(lightingForMinute(360));
      expect(lightingForMinute(minute, true)).toEqual(lightingForMinute(360, true));
    }
  });
});
