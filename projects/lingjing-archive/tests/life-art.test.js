import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const base = new URL("../public/farm-assets/original-addons/v8/", import.meta.url);
const frames = {
  "town-buildings-v1": ["workshop", "hall"],
  "residents-motion-v1": ["merchant", "guide", "carpenter"].flatMap(kind => ["idle", "blink", "greet"].map(pose => `${kind}_${pose}`)),
};

describe("resident and town original asset contracts", () => {
  for (const [name, expected] of Object.entries(frames)) {
    it(`${name} has the complete intended frames and matching transparent PNG provenance`, () => {
      const atlas = JSON.parse(readFileSync(new URL(`${name}.json`, base), "utf8"));
      const png = readFileSync(new URL(`${name}.png`, base));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png[25]).toBe(6); // RGBA; actual transparency is additionally measured in the source record.
      expect(png.readUInt32BE(16)).toBe(atlas.meta.size.w);
      expect(png.readUInt32BE(20)).toBe(atlas.meta.size.h);
      expect(createHash("sha256").update(png).digest("hex")).toBe(atlas.meta.imageSha256);
      expect(Object.keys(atlas.frames).sort()).toEqual(expected.toSorted());
      for (const frame of Object.values(atlas.frames)) {
        const f = frame.frame, s = frame.spriteSourceSize, c = frame.sourceSize;
        expect(f.x).toBeGreaterThanOrEqual(0); expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.w).toBeGreaterThan(0); expect(f.h).toBeGreaterThan(0);
        expect(f.x + f.w).toBeLessThanOrEqual(atlas.meta.size.w);
        expect(f.y + f.h).toBeLessThanOrEqual(atlas.meta.size.h);
        expect(s.x).toBeGreaterThanOrEqual(0); expect(s.y).toBeGreaterThanOrEqual(0);
        expect([s.w,s.h]).toEqual([f.w,f.h]);
        expect(s.x + s.w).toBeLessThanOrEqual(c.w);
        expect(s.y + s.h).toBeLessThanOrEqual(c.h);
        expect(frame.rotated).toBe(false);
      }
    });
  }

  it("keeps all three poses on a shared canvas and foot baseline for each resident", () => {
    const atlas = JSON.parse(readFileSync(new URL("residents-motion-v1.json", base), "utf8"));
    for (const kind of ["merchant", "guide", "carpenter"]) {
      const poses = ["idle", "blink", "greet"].map(pose => atlas.frames[`${kind}_${pose}`]);
      for (const frame of poses) {
        expect(frame.sourceSize).toEqual(poses[0].sourceSize);
        const measured = atlas.meta.measurements.rows.find(row => row.name === kind)
          .frames.find(pose => atlas.frames[`${kind}_${pose.pose}`] === frame);
        // Crops contain transparent padding; register actual visible shoes, not the crop's bottom.
        expect(frame.spriteSourceSize.y + measured.visibleBounds[3] - frame.frame.y).toBe(frame.sourceSize.h - 2);
        expect(frame.spriteSourceSize.x + measured.footAnchorX - frame.frame.x).toBe(frame.sourceSize.w / 2);
      }
      expect(poses[1].frame).not.toEqual(poses[0].frame);
      expect(poses[2].frame).not.toEqual(poses[0].frame);
    }
  });

  it("keeps the two independent buildings in nonoverlapping crops", () => {
    const atlas = JSON.parse(readFileSync(new URL("town-buildings-v1.json", base), "utf8"));
    const left = atlas.frames.workshop.frame, right = atlas.frames.hall.frame;
    expect(left.x + left.w).toBeLessThanOrEqual(right.x);
    for (const building of Object.values(atlas.frames)) {
      expect(building.sourceSize).toEqual({w:building.frame.w,h:building.frame.h});
      expect(building.spriteSourceSize).toMatchObject({x:0,y:0});
    }
  });
});
