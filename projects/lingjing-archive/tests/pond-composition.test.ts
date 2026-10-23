import { describe, expect, it } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { planPondAccents } from "../src/game/systems/pondComposition";

describe("pond accent composition", () => {
  it("keeps reeds, lilies and movement inside the original blocked water", () => {
    const world = parseFarm01(), before = JSON.stringify(world);
    const plan = planPondAccents(world);
    expect(plan.reeds.length).toBeGreaterThan(0);
    expect(plan.reeds.length).toBeLessThanOrEqual(3);
    expect(plan.lilies.length).toBeLessThanOrEqual(2);
    expect(plan.fish.length).toBe(2);
    for (const p of [...plan.reeds, ...plan.lilies, ...plan.fish]) {
      for (const [dx, dy] of [[-p.radius, -p.radius], [p.radius, p.radius]]) {
        expect(world.tiles[Math.floor((p.y + dy) / 32)][Math.floor((p.x + dx) / 32)].key).toBe("water");
      }
    }
    expect(JSON.stringify(world)).toBe(before);
  });
  it("leaves the western casting approach and the water center open", () => {
    const plan = planPondAccents(parseFarm01());
    expect(plan.reeds.every(p => p.col >= 26)).toBe(true);
    expect(plan.lilies.every(p => p.col !== 27 || p.row !== 17)).toBe(true);
  });
  it("uses the map supplied rather than assuming fixed pond coordinates", () => {
    const world = parseFarm01();
    for (const row of world.tiles) for (const tile of row) if (tile.key === "water") {tile.key = "grass"; tile.solid = false;}
    expect(planPondAccents(world)).toEqual({ reeds: [], lilies: [], fish: [] });
    world.tiles[4][5] = {key: "water", solid: true};
    const plan = planPondAccents(world);
    expect([...plan.reeds, ...plan.lilies, ...plan.fish].every(p => p.row === 4 && p.col === 5)).toBe(true);
  });
});
