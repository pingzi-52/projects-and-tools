import { describe, expect, it } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { chooseFarmhousePlot } from "../src/game/systems/farmhousePlot";
import { chooseMerchantPlot } from "../src/game/systems/merchantPlot";

function homeReservation(): string[] {
  const home = chooseFarmhousePlot(parseFarm01(), [])!;
  const ids: string[] = [];
  for (let r = home.row; r < home.row + 4; r++) {
    for (const c of r < home.row + 2 ? [home.col, home.col + 1, home.col + 2, home.col + 3] : [home.col + 1, home.col + 2]) ids.push(`${r}_${c}`);
  }
  return ids;
}

describe("save-safe merchant lawn placement", () => {
  it("chooses a side lawn near spawn and preserves the map, old fields and reservations", () => {
    const world = parseFarm01(), fields = ["12_8", "13_9"], reserved = homeReservation();
    const before = JSON.stringify({ world, fields, reserved });
    expect(chooseMerchantPlot(world, fields, reserved)).toEqual({ row: 12, col: 18, x: 592, y: 400 });
    expect(JSON.stringify({ world, fields, reserved })).toBe(before);
  });
  it("moves away from saved farmland and house reservations without deleting either", () => {
    expect(chooseMerchantPlot(parseFarm01(), ["12_18"], [])).toMatchObject({ row: 10, col: 18 });
    expect(chooseMerchantPlot(parseFarm01(), ["12_18"], ["10_18"])).toMatchObject({ row: 13, col: 20 });
  });
  it("returns null when all side lawns are already cultivated", () => {
    const world = parseFarm01();
    const fields = world.tiles.flatMap((row, r) => row.flatMap((tile, c) => tile.key === "grass" ? [`${r}_${c}`] : []));
    expect(chooseMerchantPlot(world, fields, [])).toBeNull();
  });
  it("rejects soil, beds, spawn and solid cells even when their IDs are unreserved", () => {
    const world = parseFarm01();
    world.tiles[12][18] = { key: "soil", solid: false };
    world.tiles[10][18] = { key: "bed", solid: false };
    world.start = { row: 13, col: 20 };
    world.tiles[14][18] = { key: "rock", solid: true };
    expect(chooseMerchantPlot(world, [], [])).toMatchObject({ row: 14, col: 10 });
  });
  it("does not put its collision body in the only route from spawn to the bed", () => {
    const world = parseFarm01();
    for (const row of world.tiles) for (const tile of row) Object.assign(tile, { key: "fence", solid: true });
    world.start = { row: 12, col: 17 }; world.bed = { row: 12, col: 19 };
    world.tiles[12][17] = { key: "grass", solid: false };
    world.tiles[12][18] = { key: "grass", solid: false };
    world.tiles[12][19] = { key: "bed", solid: false };
    expect(chooseMerchantPlot(world, [], [])).toBeNull();
  });
  it("rejects a candidate with no reachable neighboring interaction cell", () => {
    const world = parseFarm01();
    for (const [r, c] of [[11, 18], [13, 18], [12, 17], [12, 19]]) world.tiles[r][c] = { key: "rock", solid: true };
    expect(chooseMerchantPlot(world, [], [])).toMatchObject({ row: 10, col: 18 });
  });
  it("keeps the existing house entrance reachable with its actual 4x2 body blocked", () => {
    const world = parseFarm01(), reserved = homeReservation();
    // Isolate the north-side house access; adjacent NPC lawn alone is insufficient.
    for (let col = 1; col < world.width - 1; col++) world.tiles[6][col] = { key: "fence", solid: true };
    expect(chooseMerchantPlot(world, [], reserved)).toBeNull();
  });
  it("rejects a lawn that would seal the only passage to the front of a reserved house", () => {
    const world = parseFarm01(), reserved: string[] = [];
    for (const row of world.tiles) for (const tile of row) Object.assign(tile, { key: "fence", solid: true });
    world.start = { row: 13, col: 18 }; world.bed = { row: 13, col: 17 };
    for (let r = 8; r < 12; r++) {
      for (const c of r < 10 ? [16, 17, 18, 19] : [17, 18]) {
        reserved.push(`${r}_${c}`); world.tiles[r][c] = { key: "grass", solid: false };
      }
    }
    world.tiles[13][18] = { key: "grass", solid: false };
    world.tiles[13][17] = { key: "bed", solid: false };
    world.tiles[12][18] = { key: "grass", solid: false };
    // Spawn must pass north through candidate (18,12) to reach the connected doors.
    expect(chooseMerchantPlot(world, [], reserved)).toBeNull();
  });
  it("returns null for smaller maps without candidate lawns", () => {
    expect(chooseMerchantPlot(parseFarm01(["FFFFF", "FS.BF", "FFFFF"]), [], [])).toBeNull();
  });
});
