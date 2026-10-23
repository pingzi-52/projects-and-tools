import type { ParsedMap, TileDef } from "./farm01.types";

/**
 * 原创农场地图「青禾农庄」（36 × 24 格）
 *
 * 字符含义：
 *   F - 篱笆（阻挡）
 *   T - 树木（阻挡）
 *   R - 岩石（阻挡）
 *   H - 耕地（可通行，预留耕作用途）
 *   B - 床（可通行，交互推进日期）
 *   ~ - 池塘（阻挡）
 *   S - 玩家出生点（可通行）
 *   . - 草地（可通行）
 *
 * 除耕地与出生点外均视为草地。
 * 地图为程序化像素占位素材，非正式美术。
 */
export const FARM01: string[] = [
  "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
  "F...T..........................T...F",
  "F................RR..............T.F",
  "F..................................F",
  "F.......T..........................F",
  "F..................................F",
  "F............................T.....F",
  "F......HHHH..HHHH..................F",
  "F......HBHH..HHHH..................F",
  "F......HHHH..HHHH..................F",
  "F......HHHH..HHHH..................F",
  "F...R..............................F",
  "F...R..............................F",
  "F...........S......................F",
  "F..................................F",
  "F..............................T...F",
  "F.........................~~~......F",
  "F....T...................~~~~~.....F",
  "F.........................~~~....T.F",
  "F......R...................~.......F",
  "F...........................R......F",
  "F...............................T..F",
  "F........T.........................F",
  "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
];

export const MAP_START = { row: 13, col: 12 };

/** 地图每行字符（未含空格） */
export const FARM01_ROWS: string[] = FARM01;

/** 将字符地图解析为结构化网格（供场景与测试共用） */
export function parseFarm01(rows: string[] = FARM01): ParsedMap {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  if (rows.some((r) => r.length !== w)) {
    throw new Error("farm01 各行宽度不一致");
  }
  const tiles: TileDef[][] = [];
  let start = MAP_START;
  let bed: { row: number; col: number } | null = null;
  for (let r = 0; r < h; r++) {
    const rowDef: TileDef[] = [];
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (ch === "F") rowDef.push({ key: "fence", solid: true });
      else if (ch === "T") rowDef.push({ key: "tree", solid: true });
      else if (ch === "R") rowDef.push({ key: "rock", solid: true });
      else if (ch === "H") rowDef.push({ key: "soil", solid: false });
      else if (ch === "~") rowDef.push({ key: "water", solid: true });
      else if (ch === "B") {
        rowDef.push({ key: "bed", solid: false });
        bed = { row: r, col: c };
      } else if (ch === "S") {
        rowDef.push({ key: "grass", solid: false });
        start = { row: r, col: c };
      } else {
        rowDef.push({ key: "grass", solid: false });
      }
    }
    tiles.push(rowDef);
  }
  if (!bed) throw new Error("farm01 缺少床 B");
  return {
    width: w,
    height: h,
    tiles,
    start,
    bed,
  };
}
