import { describe, expect, it } from "vitest";
import { parseFarm01 } from "../src/data/maps/farm01";
import { pondCastTarget } from "../src/game/systems/fishingSpot";

describe("pond fishing reach", () => {
  const world = parseFarm01();
  it("finds water from the walkable west bank without editing the map", () => {
    const before = JSON.stringify(world);
    const target = pondCastTarget(world, { x: 784, y: 560 });
    expect(target).not.toBeNull();
    expect(world.tiles[target!.row][target!.col].key).toBe("water");
    expect(Math.hypot(target!.x - 784, target!.y - 560)).toBeLessThanOrEqual(80);
    expect(JSON.stringify(world)).toBe(before);
  });
  it("cannot cast from the farmhouse or distant main road", () => {
    expect(pondCastTarget(world, { x: 400, y: 432 })).toBeNull();
    expect(pondCastTarget(world, { x: 400, y: 176 })).toBeNull();
  });
  it("requires a clear line rather than casting through a solid bank obstacle", () => {
    const map = { width: 5, height: 3, tiles: Array.from({length:3},()=>Array.from({length:5},()=>({key:"grass",solid:false}))) };
    map.tiles[1][3] = {key:"water",solid:true};
    map.tiles[1][2] = {key:"rock",solid:true};
    expect(pondCastTarget(map as never, {x:48,y:48})).toBeNull();
    map.tiles[1][2] = {key:"grass",solid:false};
    expect(pondCastTarget(map as never, {x:48,y:48})).toMatchObject({row:1,col:3});
  });
  it.each([NaN, Infinity, -Infinity])("ignores invalid coordinates %s", x => {
    expect(pondCastTarget(world, {x,y:560})).toBeNull();
  });
});
