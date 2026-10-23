/** 地图格定义 */
export interface TileDef {
  key:
    | "grass"
    | "fence"
    | "tree"
    | "rock"
    | "soil"
    | "bed"
    | "water";
  solid: boolean;
}

export interface ParsedMap {
  width: number;
  height: number;
  /** tiles[row][col] */
  tiles: TileDef[][];
  start: { row: number; col: number };
  bed: { row: number; col: number };
}
