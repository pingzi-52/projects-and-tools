import type { ParsedMap } from "../../data/maps/farm01.types";
export interface PondAccent { row: number; col: number; x: number; y: number; radius: number }
export interface PondAccents { reeds: PondAccent[]; lilies: PondAccent[]; fish: PondAccent[] }
/** Small water-only accents. The whole 12px motion envelope fits a blocked cell. */
export function planPondAccents(world: ParsedMap): PondAccents {
  const water: PondAccent[] = [];
  for (let row = 0; row < world.height; row++) for (let col = 0; col < world.width; col++) {
    if (world.tiles[row]?.[col]?.key === "water") water.push({row, col, x: col * 32 + 16, y: row * 32 + 16, radius: 12});
  }
  if (!water.length) return {reeds: [], lilies: [], fish: []};
  const has = (row: number, col: number): boolean => world.tiles[row]?.[col]?.key === "water";
  const west = Math.min(...water.map(p => p.col));
  const top = Math.min(...water.map(p => p.row));
  const north = water.filter(p => p.col > west && !has(p.row - 1, p.col));
  const reeds = north.filter((_, i) => i % 2 === 0).slice(0, 2);
  const east = water.find(p => p.row > top && p.col > west && !has(p.row, p.col + 1) && !reeds.includes(p));
  if (east) reeds.push(east);
  const middleX = (Math.min(...water.map(p => p.x)) + Math.max(...water.map(p => p.x))) / 2;
  const middleY = (Math.min(...water.map(p => p.y)) + Math.max(...water.map(p => p.y))) / 2;
  const inside = water.filter(p => has(p.row - 1,p.col) && has(p.row + 1,p.col) && has(p.row,p.col - 1) && has(p.row,p.col + 1));
  const lilies = inside.filter(p => !reeds.includes(p) && (p.x !== middleX || p.row !== top + 1)).slice(0, 2);
  const fish = [...water].sort((a,b) => Math.hypot(a.x-middleX,a.y-middleY) - Math.hypot(b.x-middleX,b.y-middleY)).filter(p => !lilies.includes(p) && !reeds.includes(p)).slice(0, 2);
  return {reeds, lilies, fish};
}
