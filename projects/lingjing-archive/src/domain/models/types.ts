import type { FarmTileState } from "./Crop";
import type { InventoryState } from "./Item";

/** 原创日历：每季14天 */
export type Season = "spring" | "summer" | "autumn" | "winter";
export interface DateInfo { day: number; season: Season }

/** 游戏内当日分钟（06:00..22:00，10分钟步进）与剩余体力。 */
export interface DailyState { minute: number; energy: number }

/** 入门委托：未接取时没有目标，接取后保存已知作物ID。 */
export type IntroQuestState =
  | { status: "available"; cropId: null }
  | { status: "active" | "completed"; cropId: string };

export type ExplorationQuestStatus = "available" | "active" | "completed";
export interface FishingQuestState { status: "available" | "active" | "completed" }

/** 仅持久化探索进度和稳定采集ID，不保存场景或渲染坐标。 */
export interface ExplorationState {
  forageDay: number;
  picked: string[];
  forestQuest: ExplorationQuestStatus;
  carpenterQuest: ExplorationQuestStatus;
  lanternBuilt: boolean;
}

/** V7新增一次性池塘委托；V1..V6在读取边界严格验证并迁移。 */
export interface SaveData {
  version: 7;
  gold: number;
  day: number;
  inventory: InventoryState;
  chest: InventoryState;
  farming: FarmTileState[];
  daily: DailyState;
  introQuest: IntroQuestState;
  exploration: ExplorationState;
  fishingQuest: FishingQuestState;
}
export const SAVE_VERSION = 7;
export const SAVE_KEY = "four-seasons-farm/save";
