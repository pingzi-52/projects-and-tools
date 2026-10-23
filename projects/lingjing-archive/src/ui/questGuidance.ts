import type { AreaId } from "../data/maps/areaConnections";
import type { GameSession } from "../game/systems/GameSession";
import { getCrop } from "../data/crops";
import { EXPLORATION_QUESTS, FORAGE_NODES } from "../data/exploration";
import { getItem } from "../data/items";

export type GuidanceStatus = "available" | "active" | "ready" | "completed";

export interface QuestGuidance {
  area: AreaId;
  title: string;
  resident: string;
  status: GuidanceStatus;
  requirements: { itemId: string; name: string; have: number; need: number }[];
  progress: string;
  nextStep: string;
}

export function getQuestGuidance(
  session: Pick<GameSession, "introQuest" | "exploration" | "inventory">,
  area: AreaId,
): QuestGuidance {
  const resident = area === "farm" ? "禾木" : area === "forest" ? "岚" : "阿榆";
  const intro = session.introQuest.state;
  const exploration = session.exploration.state;
  const savedStatus = area === "farm" ? intro.status
    : area === "forest" ? exploration.forestQuest : exploration.carpenterQuest;
  const crop = area === "farm" && intro.cropId !== null ? getCrop(intro.cropId) : undefined;
  const quest = area === "farm" ? null : EXPLORATION_QUESTS[area === "forest" ? "forest" : "carpenter"];
  const materials = quest?.requirements ?? (crop ? [{ itemId: crop.id, amount: 1 }] : []);
  const requirements = materials.map(material => ({
    itemId: material.itemId,
    // Match the visible forage names, including the forest's "枯枝" label.
    name: (crop?.id === material.itemId ? crop.name : undefined)
      ?? FORAGE_NODES.find(node => node.itemId === material.itemId)?.name
      ?? getItem(material.itemId)?.name ?? material.itemId,
    have: session.inventory.count(material.itemId),
    need: material.amount,
  }));
  const status: GuidanceStatus = savedStatus === "active" && requirements.length > 0
    && requirements.every(material => material.have >= material.need) ? "ready" : savedStatus;
  const progress = requirements.length
    ? requirements.map(material => `${material.name} ${material.have}/${material.need}`).join(" · ")
    : "尚未接取";
  let nextStep: string;
  switch (status) {
    case "available": nextStep = `找${resident}按 E 接取委托`; break;
    case "ready": nextStep = `材料齐了，找${resident}按 E 核对交付`; break;
    case "completed": nextStep = area === "farm" ? "继续探索森林与小镇" : "继续探索，或按 K 查看制作"; break;
    case "active": nextStep = area === "farm"
      ? `照料作物并收获${crop?.name ?? "委托作物"}，放入随身背包`
      : area === "forest" ? "前往森林采集野蘑菇，带在随身背包中" : "前往森林采集枯枝与溪石，带在随身背包中";
  }
  return { area, title: quest?.name ?? "首份收成", resident, status, requirements, progress, nextStep };
}
