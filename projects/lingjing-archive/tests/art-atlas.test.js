import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FARMER_FRAMES } from "../src/game/systems/farmerVisual";

// Node-side asset verification uses JS to avoid adding Node typings to browser game code.
function atlas(name) {
  return JSON.parse(readFileSync(new URL(`../public/farm-assets/original-addons/v3/${name}.json`, import.meta.url), "utf8"));
}

describe("original art atlas contracts", () => {
  for (const name of ["farmer-v1", "spring-crops-v1", "soil-v1"]) {
    it(`${name} crops fit the actual PNG and preserve a valid source canvas`, () => {
      const sheet = atlas(name);
      const png = readFileSync(new URL(`../public/farm-assets/original-addons/v3/${name}.png`, import.meta.url));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(sheet.meta.size.w);
      expect(png.readUInt32BE(20)).toBe(sheet.meta.size.h);
      for (const f of Object.values(sheet.frames)) {
        expect(f.frame.x).toBeGreaterThanOrEqual(0); expect(f.frame.y).toBeGreaterThanOrEqual(0);
        expect(f.frame.w).toBeGreaterThan(0); expect(f.frame.h).toBeGreaterThan(0);
        expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(sheet.meta.size.w);
        expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(sheet.meta.size.h);
        expect(f.spriteSourceSize.x).toBeGreaterThanOrEqual(0); expect(f.spriteSourceSize.y).toBeGreaterThanOrEqual(0);
        expect(f.spriteSourceSize.x + f.spriteSourceSize.w).toBeLessThanOrEqual(f.sourceSize.w);
        expect(f.spriteSourceSize.y + f.spriteSourceSize.h).toBeLessThanOrEqual(f.sourceSize.h);
        expect(f.spriteSourceSize.w).toBe(f.frame.w); expect(f.spriteSourceSize.h).toBe(f.frame.h);
      }
    });
  }
  it("all directional poses use a constant canvas and feet baseline", () => {
    const frames = atlas("farmer-v1").frames;
    expect(Object.keys(frames).sort()).toEqual([...FARMER_FRAMES].sort());
    for (const f of Object.values(frames)) {
      expect(f.sourceSize).toEqual({ w: 208, h: 312 });
      expect(f.spriteSourceSize.y + f.spriteSourceSize.h).toBe(310);
    }
  });
  it("three spring crops provide all four stages aligned at ground level", () => {
    const frames = atlas("spring-crops-v1").frames;
    const expected = ["dew_radish", "morning_bean", "starberry"].flatMap(c => ["seed", "sprout", "young", "mature"].map(s => `${c}_${s}`));
    expect(Object.keys(frames).sort()).toEqual(expected.sort());
    for (const f of Object.values(frames)) {
      expect(f.sourceSize).toEqual({ w: 368, h: 352 });
      expect(f.spriteSourceSize.y + f.spriteSourceSize.h).toBe(350);
    }
  });
});
