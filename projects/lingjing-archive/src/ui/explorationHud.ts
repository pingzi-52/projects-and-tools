import type { ExplorationMap } from "../data/maps/explorationMaps";
import type { QuestGuidance } from "./questGuidance";
import { TILE } from "../game/config";

export function compactQuestText(guidance: QuestGuidance, picked: number, total: number): string {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const gathered = Number.isFinite(picked) ? Math.max(0, Math.min(Math.floor(picked), count)) : 0;
  const status = {
    available: `找${guidance.resident}接取`,
    active: guidance.progress,
    ready: `材料齐了 · 找${guidance.resident}交付`,
    completed: "委托已完成",
  }[guidance.status];
  const collection = guidance.area === "forest" ? ` · 已采 ${gathered}/${count}` : "";
  return `${guidance.title} · L 手记\n${status}${collection}`;
}

export function townFrontageHint(
  player: { x: number; y: number },
  buildings: ExplorationMap["buildings"],
): string | null {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return null;
  for (const building of buildings) {
    const left = building.col * TILE;
    const right = (building.col + building.width) * TILE;
    const feet = (building.row + building.height) * TILE;
    if (player.x < left || player.x > right || player.y < feet || player.y > feet + 64) continue;
    if (building.label === "木匠工坊") return "木匠工坊 · 阿榆在广场 · 室内暂未开放";
    if (building.label === "林缘会馆") return "林缘会馆 · 室内暂未开放";
  }
  return null;
}
