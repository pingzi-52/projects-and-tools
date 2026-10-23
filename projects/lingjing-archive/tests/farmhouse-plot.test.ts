import { describe, expect, it } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { chooseFarmhousePlot, containsHomeTile } from "../src/game/systems/farmhousePlot";

describe("save-safe farmhouse plot reservation", () => {
  it("selects the primary grass footprint without mutating terrain or cultivated input", () => {
    const world = parseFarm01();
    const before = JSON.stringify(world);
    const cultivated = ["12_8", "13_9"];
    const plot = chooseFarmhousePlot(world, cultivated)!;
    expect(plot).toEqual({ col: 10, row: 3, width: 4, height: 2, doorX: 384, doorY: 176 });
    expect(JSON.stringify(world)).toBe(before);
    expect(cultivated).toEqual(["12_8", "13_9"]);
    for (let row = plot.row; row < plot.row + plot.height; row++) {
      for (let col = plot.col; col < plot.col + plot.width; col++) {
        expect(world.tiles[row][col]).toEqual({ key: "grass", solid: false });
        expect(cultivated).not.toContain(`${row}_${col}`);
      }
    }
  });

  it("moves to the next safe plot when a save already farms the footprint or entrance", () => {
    const world = parseFarm01();
    expect(chooseFarmhousePlot(world, ["3_10"])?.col).toBe(16);
    expect(chooseFarmhousePlot(world, ["5_11"])?.col).toBe(16);
    expect(chooseFarmhousePlot(world, ["3_10", "3_16"])?.col).toBe(21);
    expect(chooseFarmhousePlot(world, ["3_10", "3_16", "3_21"])?.row).toBe(11);
    expect(chooseFarmhousePlot(world, ["3_10", "3_16", "3_21", "11_18"])).toBeNull();
  });

  it("protects spawn, beds, existing soil and solid entrance tiles", () => {
    const world = parseFarm01();
    world.start = { row: 3, col: 10 };
    world.tiles[3][16] = { key: "soil", solid: false };
    world.tiles[5][22] = { key: "rock", solid: true };
    world.bed = { row: 11, col: 18 };
    expect(chooseFarmhousePlot(world, [])).toBeNull();
  });

  it("requires reachable front access after reserving the building footprint", () => {
    const world = parseFarm01();
    for (let row = 0; row < 7; row++) for (let col = 0; col < world.width; col++) {
      if (row === 2 || row === 6 || col === 9 || col === 14) world.tiles[row][col] = { key: "fence", solid: true };
    }
    expect(chooseFarmhousePlot(world, [])?.row).toBe(11);
  });

  it("uses exactly the 4x2 reserved footprint, with no false positive at the doorway", () => {
    const plot = chooseFarmhousePlot(parseFarm01(), [])!;
    expect(containsHomeTile(plot, 3, 10)).toBe(true);
    expect(containsHomeTile(plot, 4, 13)).toBe(true);
    expect(containsHomeTile(plot, 5, 12)).toBe(false);
    expect(containsHomeTile(plot, 4, 14)).toBe(false);
    expect(containsHomeTile(null, 3, 10)).toBe(false);
    expect(chooseFarmhousePlot(parseFarm01(["FFF", "FBS", "FFF"]), [])).toBeNull();
  });
});
