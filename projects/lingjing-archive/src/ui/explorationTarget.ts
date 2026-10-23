import type { ForageNode } from "../data/maps/explorationMaps";

interface Point { x: number; y: number }
export type ExplorationTarget = { kind: "resident" }
  | { kind: "node"; node: ForageNode; picked: boolean } | null;

/** The hint, highlight and E action share this selection; map/session data stay untouched. */
export function selectExplorationTarget(player: Point, resident: Point, nodes: readonly ForageNode[], picked: readonly string[]): ExplorationTarget {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return null;
  if (Math.hypot(player.x - resident.x, player.y - resident.y) <= 64) return { kind: "resident" };
  let result: ExplorationTarget = null, bestDistance = Infinity;
  for (const node of nodes) {
    const distance = Math.hypot(player.x - (node.col + 0.5) * 32, player.y - (node.row + 0.5) * 32);
    if (!(distance <= 44)) continue;
    const depleted = picked.includes(node.id);
    if (result === null || (result.kind === "node" && result.picked && !depleted)
      || (result.kind === "node" && result.picked === depleted && distance < bestDistance)) {
      result = { kind: "node", node, picked: depleted }; bestDistance = distance;
    }
  }
  return result;
}
