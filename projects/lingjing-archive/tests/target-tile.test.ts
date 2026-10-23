import { describe, it, expect } from "vitest";
import {
  computeTargetTile,
  pickFacing,
  tileIdOf,
} from "../src/game/utils/targetTile";

// ────────────────────────────────────────────────
// computeTargetTile
// ────────────────────────────────────────────────
describe("computeTargetTile - 四方向（格中心）", () => {
  // 格 1_1 中心：x = 1*32 + 16 = 48，y = 48
  const X = 48;
  const Y = 48;
  const SIZE = 32;

  it("down → (2, 1)", () => {
    expect(computeTargetTile(X, Y, "down", SIZE)).toEqual({ row: 2, col: 1 });
  });
  it("up → (0, 1)", () => {
    expect(computeTargetTile(X, Y, "up", SIZE)).toEqual({ row: 0, col: 1 });
  });
  it("left → (1, 0)", () => {
    expect(computeTargetTile(X, Y, "left", SIZE)).toEqual({ row: 1, col: 0 });
  });
  it("right → (1, 2)", () => {
    expect(computeTargetTile(X, Y, "right", SIZE)).toEqual({ row: 1, col: 2 });
  });
});

describe("computeTargetTile - 格边界（同格内像素变化不换格）", () => {
  it("格左缘 x=32, y=48 → (2, 1)", () => {
    expect(computeTargetTile(32, 48, "down", 32)).toEqual({ row: 2, col: 1 });
  });
  it("格右缘前一像素 x=63, y=48 → (2, 1)", () => {
    expect(computeTargetTile(63, 48, "down", 32)).toEqual({ row: 2, col: 1 });
  });
});

describe("computeTargetTile - 越界不裁剪", () => {
  it("左上角越界 up → (-1, 0)", () => {
    expect(computeTargetTile(16, 16, "up", 32)).toEqual({ row: -1, col: 0 });
  });
  it("右下角越界 down → (24, 35)", () => {
    // 地图 36×24；格 23_35 中心 = (35*32+16, 23*32+16) = (1136, 752)
    expect(computeTargetTile(1136, 752, "down", 32)).toEqual({ row: 24, col: 35 });
  });
});

describe("computeTargetTile - 大 tileSize", () => {
  it("size=128, (200, 200, right) → (1, 2)", () => {
    // floor(200/128)=1 (row & col)；right → col+1=2
    expect(computeTargetTile(200, 200, "right", 128)).toEqual({ row: 1, col: 2 });
  });
});

describe("computeTargetTile - 非法入参抛 RangeError", () => {
  it("NaN 坐标", () => {
    expect(() => computeTargetTile(NaN, 0, "down", 32)).toThrow(RangeError);
    expect(() => computeTargetTile(0, NaN, "down", 32)).toThrow(RangeError);
  });
  it("Infinity 坐标", () => {
    expect(() => computeTargetTile(Infinity, 0, "down", 32)).toThrow(RangeError);
  });
  it("tileSize = 0 或负数", () => {
    expect(() => computeTargetTile(0, 0, "down", 0)).toThrow(RangeError);
    expect(() => computeTargetTile(0, 0, "down", -32)).toThrow(RangeError);
  });
  it("tileSize = NaN", () => {
    expect(() => computeTargetTile(0, 0, "down", NaN)).toThrow(RangeError);
  });
});

// ────────────────────────────────────────────────
// tileIdOf
// ────────────────────────────────────────────────
describe("tileIdOf", () => {
  it("(0, 0) → '0_0'", () => {
    expect(tileIdOf(0, 0)).toBe("0_0");
  });
  it("(3, 7) → '3_7'", () => {
    expect(tileIdOf(3, 7)).toBe("3_7");
  });
  it("(-1, 5) → '-1_5'（越界不裁剪，但仍是合法整数）", () => {
    expect(tileIdOf(-1, 5)).toBe("-1_5");
  });
  it("非整数抛 RangeError", () => {
    expect(() => tileIdOf(1.5, 0)).toThrow(RangeError);
    expect(() => tileIdOf(0, NaN)).toThrow(RangeError);
  });
});

// ────────────────────────────────────────────────
// pickFacing
// ────────────────────────────────────────────────
describe("pickFacing - 静止保持上次朝向", () => {
  it("(0, 0, 'up') → 'up'", () => {
    expect(pickFacing(0, 0, "up")).toBe("up");
  });
  it("(0, 0, 'left') → 'left'", () => {
    expect(pickFacing(0, 0, "left")).toBe("left");
  });
});

describe("pickFacing - 单轴", () => {
  it("(+, 0) → right", () => {
    expect(pickFacing(160, 0, "down")).toBe("right");
  });
  it("(-, 0) → left", () => {
    expect(pickFacing(-160, 0, "down")).toBe("left");
  });
  it("(0, +) → down", () => {
    expect(pickFacing(0, 160, "up")).toBe("down");
  });
  it("(0, -) → up", () => {
    expect(pickFacing(0, -160, "down")).toBe("up");
  });
});

describe("pickFacing - 对角：横向优先（含绝对值相等）", () => {
  it("(+, +) → right", () => {
    expect(pickFacing(160, 160, "up")).toBe("right");
  });
  it("(-, -) → left", () => {
    expect(pickFacing(-160, -160, "up")).toBe("left");
  });
  it("(+, -) → right", () => {
    expect(pickFacing(160, -160, "down")).toBe("right");
  });
  it("(-, +) → left", () => {
    expect(pickFacing(-160, 160, "up")).toBe("left");
  });
});

describe("pickFacing - 非对角：绝对值大者优先", () => {
  it("(|vx| > |vy|) → 横向", () => {
    expect(pickFacing(200, 100, "up")).toBe("right");
    expect(pickFacing(-200, 100, "up")).toBe("left");
  });
  it("(|vy| > |vx|) → 竖向", () => {
    expect(pickFacing(100, 200, "left")).toBe("down");
    expect(pickFacing(100, -200, "left")).toBe("up");
  });
});
