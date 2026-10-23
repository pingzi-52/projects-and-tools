import type { FarmDetail } from "./farmDetails";

export interface DetailSprite { frame: string; x: number; y: number }
export function detailSprites(detail: FarmDetail): DetailSprite[] {
  if (detail.kind === "shrub") return [{ frame: "TX Bush T1", x: 16, y: 29 }];
  if (detail.kind === "flowers") {
    const spots = [[8, 12], [23, 19], [13, 28]] as const;
    const offset = (detail.row + detail.col) % spots.length;
    return Array.from({ length: detail.density ?? 2 }, (_, index) => {
      const [x, y] = spots[(index + offset) % spots.length];
      return { frame: "TX Plant - Flower 01", x, y };
    });
  }
  const variant = String((detail.row * 7 + detail.col * 3) % 6 + 1).padStart(2, "0");
  const sprites = [{ frame: `TX Plant - Grass ${variant}`, x: 13, y: 22 }];
  if ((detail.density ?? 1) > 1) sprites.push({ frame: "TX Plant - Grass 13", x: 24, y: 30 });
  return sprites;
}
