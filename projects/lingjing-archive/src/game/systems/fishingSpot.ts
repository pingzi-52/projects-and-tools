import type { ParsedMap } from "../../data/maps/farm01.types";
const TILE = 32;
export interface FishingSpot { row: number; col: number; x: number; y: number }
/** Nearby water with an unobstructed cast; decoration and terrain remain unchanged. */
export function pondCastTarget(world: Pick<ParsedMap, "width" | "height" | "tiles">, player: {x:number;y:number}): FishingSpot | null {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return null;
  const row = Math.floor(player.y / TILE), col = Math.floor(player.x / TILE);
  let closest: FishingSpot | null = null, distance = 80;
  for (let r = Math.max(0,row-3); r <= Math.min(world.height-1,row+3); r++) {
    for (let c = Math.max(0,col-3); c <= Math.min(world.width-1,col+3); c++) {
      if (world.tiles[r][c].key !== "water") continue;
      const x=(c+.5)*TILE,y=(r+.5)*TILE,d=Math.hypot(x-player.x,y-player.y);
      if (d > distance) continue;
      const steps = Math.max(1,Math.ceil(d/8)); let clear = true;
      for(let i=1;i<steps;i++) {
        const rr=Math.floor((player.y+(y-player.y)*i/steps)/TILE);
        const cc=Math.floor((player.x+(x-player.x)*i/steps)/TILE);
        const tile=world.tiles[rr]?.[cc];
        if (!tile || (tile.solid && tile.key !== "water")) {clear=false;break;}
      }
      if(clear) { closest={row:r,col:c,x,y}; distance=d; }
    }
  }
  return closest;
}
