import type { GameSession } from "../game/systems/GameSession";
import { FISHES, type FishId } from "../data/fishing";
import { FISHING_QUEST } from "../data/fishingQuest";
import type { GuidanceStatus } from "./questGuidance";
export interface FishingQuestGuidance {
  title: string;
  status: GuidanceStatus;
  reward: number;
  nextStep: string;
  choices: {id:FishId;name:string;have:number}[];
}
/** Read-only presentation: only carried fish qualify, no implicit delivery. */
export function getFishingQuestGuidance(session: Pick<GameSession,"fishingQuest"|"inventory">): FishingQuestGuidance {
  const saved=session.fishingQuest.state.status;
  const choices=saved==="active" ? FISHES.map(fish=>({id:fish.id,name:fish.name,have:session.inventory.count(fish.id)})).filter(fish=>fish.have>0) : [];
  const status=saved==="active" && choices.length ? "ready" : saved;
  const nextStep=status==="available" ? "到农场东南池塘按 F，接取一次性委托。"
    : status==="active" ? "在池塘钓到任意一尾鱼并收好，木箱中的鱼先取到背包。"
    : status==="ready" ? "到东南池塘按 F，选择交付任意一尾鱼。"
    : "委托已完成，60金已领取；继续垂钓或探索农场。";
  return {title:FISHING_QUEST.title,status,reward:FISHING_QUEST.reward,nextStep,choices};
}
