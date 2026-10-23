import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { forestTreeBounds, TREE_RENDER_SCALE } from "../src/data/maps/forestReadability";
import { createTownMap } from "../src/data/maps/explorationMaps";

describe("forest atlas measurements and preserved town topology", () => {
  it("matches actual combined tree rectangles from the shipped Cainos atlas", () => {
    const atlas = JSON.parse(readFileSync(new URL("../public/farm-assets/cainos-basic/TX Plant.json", import.meta.url), "utf8"));
    expect(TREE_RENDER_SCALE).toBe(0.65);
    for (const [index, kind] of ["T1", "T2", "T3"].entries()) {
      const upper = atlas.frames[`TX Tree ${kind} Upper`].frame;
      const lower = atlas.frames[`TX Tree ${kind} Lower`].frame;
      const bounds = forestTreeBounds(0, index);
      expect(bounds.right - bounds.left).toBeCloseTo(upper.w * TREE_RENDER_SCALE);
      expect(bounds.bottom - bounds.top).toBeCloseTo((lower.y + lower.h - upper.y) * TREE_RENDER_SCALE);
    }
  });

  it("retains the original town snapshot except eight explicitly allowed paving additions", () => {
    const { clearings, ...town } = createTownMap();
    expect(clearings).toEqual([]);
    const extra = new Set([9, 10].flatMap(row => [7, 10, 21, 24].map(col => `${row}_${col}`)));
    expect(town.paths.filter(p => extra.has(`${p.row}_${p.col}`))).toHaveLength(8);
    town.paths = town.paths.filter(p => !extra.has(`${p.row}_${p.col}`));
    expect(town.paths).toHaveLength(123);
    expect(createHash("sha256").update(JSON.stringify(town)).digest("hex"))
      .toBe("2f728fc3cb45db25e5f41cfc0e286946b0e48e96303492b24dbbcca9e301b783");
  });
});
