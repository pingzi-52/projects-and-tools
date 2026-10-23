import { describe, expect, it } from "vitest";
import {
  FARM01,
  parseFarm01,
} from "../src/data/maps/farm01";

describe("farm01 地图数据", () => {
  it("地图为 24 行 × 36 列", () => {
    expect(FARM01.length).toBe(24);
    for (const row of FARM01) {
      expect(row.length).toBe(36);
    }
  });

  it("四周边界全部为篱笆", () => {
    const top = FARM01[0];
    const bottom = FARM01[FARM01.length - 1];
    expect(top).toBe("F".repeat(top.length));
    expect(bottom).toBe("F".repeat(bottom.length));
    for (const row of FARM01) {
      expect(row[0]).toBe("F");
      expect(row[row.length - 1]).toBe("F");
    }
  });

  it("解析后每格尺寸与地图一致，且唯一出生点与床", () => {
    const world = parseFarm01();
    expect(world.width).toBe(36);
    expect(world.height).toBe(24);
    expect(world.start).toEqual({ row: 13, col: 12 });
    expect(world.bed).toEqual({ row: 8, col: 8 });

    let beds = 0;
    let starts = 0;
    for (let r = 0; r < world.height; r++) {
      for (let c = 0; c < world.width; c++) {
        if (world.tiles[r][c].key === "bed") beds++;
        if (r === world.start.row && c === world.start.col) starts++;
      }
    }
    expect(beds).toBe(1);
    expect(starts).toBe(1);
    expect(world.tiles[world.start.row][world.start.col].solid).toBe(false);
  });

  it("实心格与软格标记正确（F/T/R/~ 阻挡，H/B/S/. 通行）", () => {
    const world = parseFarm01();
    const SOLID = new Set(["F", "T", "R", "~"]);
    for (let r = 0; r < world.height; r++) {
      for (let c = 0; c < world.width; c++) {
        const ch = FARM01[r][c];
        const expectedSolid = SOLID.has(ch);
        expect(
          world.tiles[r][c].solid,
          `tile [${r}][${c}] '${ch}'`,
        ).toBe(expectedSolid);
      }
    }
    // 各类型至少出现一次
    const keys = new Set(world.tiles.flat().map((t) => t.key));
    expect(keys).toEqual(
      new Set(["grass", "fence", "tree", "rock", "soil", "bed", "water"]),
    );
    expect(world.tiles[world.start.row][world.start.col].solid).toBe(false);
  });

  it("出生点可达：出生格四邻不含实心格", () => {
    const world = parseFarm01();
    const { row, col } = world.start;
    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ] as const;
    for (const [r, c] of neighbors) {
      expect(world.tiles[r][c].solid, `neighbor [${r}][${c}]`).toBe(false);
    }
  });
});
