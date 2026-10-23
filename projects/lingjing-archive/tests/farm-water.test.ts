import { describe, it, expect } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { planFarmWater } from "../src/game/systems/farmWaterPlan";

describe("display-only water shoreline plan", () => {
  it("keeps all 12 original water cells and the map unchanged", () => {
    const world = parseFarm01();
    const original = JSON.stringify(world);
    const plan = planFarmWater(world);
    expect(plan.cells).toHaveLength(12);
    expect(plan.width).toBe(5);
    expect(plan.height).toBe(4);
    expect(JSON.stringify(world)).toBe(original);
    const water = world.tiles.flatMap((row, r) => row.flatMap((tile, c) =>
      tile.key === "water" ? [`${r}_${c}`] : []));
    expect(plan.cells.map(c => `${c.row}_${c.col}`)).toEqual(water);
  });

  it("draws shore exactly at exposed edges and never between adjoining water cells", () => {
    const world = parseFarm01();
    const directions = { north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1] } as const;
    for (const cell of planFarmWater(world).cells) {
      for (const [side, [dr, dc]] of Object.entries(directions)) {
        expect(cell.edges.includes(side as keyof typeof directions))
          .toBe(world.tiles[cell.row + dr]?.[cell.col + dc]?.key !== "water");
      }
    }
  });

  it("supports border water and maps with no water without reading past edges", () => {
    const world = parseFarm01(["~B", "S."]);
    expect(planFarmWater(world).cells[0].edges).toEqual(["north", "east", "south", "west"]);
    expect(planFarmWater(parseFarm01([".B", "S."]))).toEqual({ cells: [], width: 0, height: 0 });
  });
});
