import { FORAGE_NODES, type ExplorationQuestKind } from "../../data/exploration";
import type { Result } from "../models/Result";
import type { ExplorationState } from "../models/types";

const validDay = (day: number): boolean => Number.isSafeInteger(day) && day >= 1 && day <= 1_000_000;
const initial = (day: number): ExplorationState => ({ forageDay: day, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false });
const isKind = (kind: string): kind is ExplorationQuestKind => kind === "forest" || kind === "carpenter";

/** Owns daily depletion and durable milestones, without inventory or storage effects. */
export class ExplorationService {
  private current: ExplorationState;
  constructor(day = 1) { if (!validDay(day)) throw new RangeError("Invalid exploration day"); this.current = initial(day); }
  get state(): ExplorationState { return { ...this.current, picked: [...this.current.picked] }; }
  serialize(): ExplorationState { return this.state; }
  restore(state: ExplorationState, day = state?.forageDay): void {
    if (!state || typeof state !== "object" || !validDay(day) || !validDay(state.forageDay) || state.forageDay > day
      || Object.keys(state).length !== 5 || !["forageDay", "picked", "forestQuest", "carpenterQuest", "lanternBuilt"].every(key => Object.prototype.hasOwnProperty.call(state, key))
      || !Array.isArray(state.picked) || state.picked.length > FORAGE_NODES.length || new Set(state.picked).size !== state.picked.length
      || !state.picked.every(id => FORAGE_NODES.some(node => node.id === id))
      || !["available", "active", "completed"].includes(state.forestQuest) || !["available", "active", "completed"].includes(state.carpenterQuest)
      || typeof state.lanternBuilt !== "boolean" || (state.lanternBuilt && state.carpenterQuest !== "completed")) {
      throw new RangeError("Invalid exploration state");
    }
    this.current = { ...state, picked: [...state.picked] };
    this.beginDay(day);
  }
  newGame(day = 1): void { if (!validDay(day)) throw new RangeError("Invalid exploration day"); this.current = initial(day); }
  beginDay(day: number): void {
    if (!validDay(day) || day < this.current.forageDay) throw new RangeError("Invalid exploration day");
    if (day !== this.current.forageDay) this.current = { ...this.current, forageDay: day, picked: [] };
  }
  gather(id: string): Result {
    if (!FORAGE_NODES.some(node => node.id === id)) return { ok: false, reason: "UNKNOWN_NODE" };
    if (this.current.picked.includes(id)) return { ok: false, reason: "ALREADY_PICKED" };
    this.current.picked.push(id); return { ok: true, value: undefined };
  }
  acceptQuest(kind: ExplorationQuestKind): Result {
    if (!isKind(kind)) return { ok: false, reason: "UNKNOWN_QUEST" };
    const key = kind === "forest" ? "forestQuest" : "carpenterQuest";
    if (this.current[key] !== "available") return { ok: false, reason: "QUEST_ALREADY_ACCEPTED" };
    this.current[key] = "active"; return { ok: true, value: undefined };
  }
  completeQuest(kind: ExplorationQuestKind): Result {
    if (!isKind(kind)) return { ok: false, reason: "UNKNOWN_QUEST" };
    const key = kind === "forest" ? "forestQuest" : "carpenterQuest";
    if (this.current[key] !== "active") return { ok: false, reason: "QUEST_NOT_ACTIVE" };
    this.current[key] = "completed"; return { ok: true, value: undefined };
  }
  buildLantern(): Result {
    if (this.current.lanternBuilt) return { ok: false, reason: "ALREADY_BUILT" };
    if (this.current.carpenterQuest !== "completed") return { ok: false, reason: "RECIPE_LOCKED" };
    this.current.lanternBuilt = true; return { ok: true, value: undefined };
  }
}
