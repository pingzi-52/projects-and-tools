import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { soilQuarterFrames } from "../src/game/systems/farmSoilSurface";

it("connected soil source and all 48 state/neighbor choices have valid alpha atlas crops", () => {
  const base = "../public/farm-assets/original-addons/v4/soil-patches-v2";
  const sheet = JSON.parse(readFileSync(new URL("../public/farm-assets/original-addons/v4/soil-patches-v3.json", import.meta.url), "utf8"));
  const png = readFileSync(new URL(base + ".png", import.meta.url));
  expect(png.readUInt32BE(16)).toBe(sheet.meta.size.w);
  expect(png.readUInt32BE(20)).toBe(sheet.meta.size.h);
  expect(png[25]).toBe(6); // PNG RGBA: real transparent rims.
  expect(Object.keys(sheet.frames)).toHaveLength(108);
  for (const state of ["raw", "dry", "wet"]) for (let mask = 0; mask < 16; mask++) {
    for (const q of soilQuarterFrames(state, mask)) {
      const { frame: f } = sheet.frames[q.frame];
      expect(f.x).toBeGreaterThanOrEqual(0); expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(sheet.meta.size.w);
      expect(f.y + f.h).toBeLessThanOrEqual(sheet.meta.size.h);
      expect([f.w, f.h]).toEqual([91, 91]);
    }
  }
});
