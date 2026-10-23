import { SAVE_KEY, SAVE_VERSION, type DailyState, type IntroQuestState, type ExplorationState, type FishingQuestState, type SaveData } from "../domain/models/types";
import type { InventoryState } from "../domain/models/Item";
import type { FarmTileState } from "../domain/models/Crop";
import { ITEMS } from "../data/items";
import { CROPS } from "../data/crops";
import { FARM01 } from "../data/maps/farm01";

export const SAVE_BACKUP_KEY = `${SAVE_KEY}/backup`;
/** 原始损坏数据只作恢复记录，永不作为可玩状态加载。 */
export const SAVE_RECOVERY_KEY = `${SAVE_KEY}/rejected`;
export const MAX_SAVE_BYTES = 256 * 1024;
export const MAX_GOLD = 1_000_000_000;
const MAX_DAY = 1_000_000;
const INVENTORY_CAPACITY = 24;

export interface SaveStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
export class MemoryStorage implements SaveStorage {
  private store = new Map<string, string>();
  get(key: string): string | null { return this.store.get(key) ?? null; }
  set(key: string, value: string): void { this.store.set(key, value); }
  remove(key: string): void { this.store.delete(key); }
}
export class LocalStorageSaveStorage implements SaveStorage {
  constructor(private readonly storage: Storage = window.localStorage) {}
  get(key: string): string | null { return this.storage.getItem(key); }
  set(key: string, value: string): void { this.storage.setItem(key, value); }
  remove(key: string): void { this.storage.removeItem(key); }
}
export function createLocalSaveManager(storage: SaveStorage = new LocalStorageSaveStorage()): SaveManager {
  return new SaveManager(storage);
}

type ObjectData = Record<string, unknown>;
const object = (v: unknown): v is ObjectData => v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const keys = (v: ObjectData, required: string[], optional: string[] = []): boolean => required.every(k => Object.prototype.hasOwnProperty.call(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const bounded = (raw: string): boolean => raw.length <= MAX_SAVE_BYTES && new TextEncoder().encode(raw).length <= MAX_SAVE_BYTES;

function initialInventory(): InventoryState {
  return { capacity: INVENTORY_CAPACITY, slots: [{ itemId: "hoe", amount: 1 }, { itemId: "watering_can", amount: 1 }, ...Array<null>(22).fill(null)] };
}

function emptyContainer(): InventoryState {
  return { capacity: INVENTORY_CAPACITY, slots: Array<null>(INVENTORY_CAPACITY).fill(null) };
}

function initialDaily(): DailyState {
  return { minute: 360, energy: 100 };
}

function initialIntroQuest(): IntroQuestState {
  return { status: "available", cropId: null };
}

function initialFishingQuest(): FishingQuestState { return { status: "available" }; }

function validateFishingQuest(value: unknown): FishingQuestState | null {
  if (!object(value) || !keys(value, ["status"]) || (value.status !== "available" && value.status !== "active" && value.status !== "completed")) return null;
  return { status: value.status };
}

function initialExploration(day: number): ExplorationState {
  return { forageDay: day, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false };
}

/** Persistence IDs intentionally do not depend on scene placement or asset data. */
const FORAGE_NODE_IDS = new Set(["wood_a", "wood_b", "wood_c", "stone_a", "stone_b", "stone_c", "mushroom_a", "mushroom_b", "mushroom_c"]);
function validateExploration(value: unknown, day: number): ExplorationState | null {
  if (!object(value) || !keys(value, ["forageDay", "picked", "forestQuest", "carpenterQuest", "lanternBuilt"])) return null;
  if (!integer(value.forageDay, 1, day) || !Array.isArray(value.picked) || value.picked.length > FORAGE_NODE_IDS.size) return null;
  if (value.picked.some(id => typeof id !== "string" || !FORAGE_NODE_IDS.has(id)) || new Set(value.picked).size !== value.picked.length) return null;
  const quest = (status: unknown): status is ExplorationState["forestQuest"] => status === "available" || status === "active" || status === "completed";
  if (!quest(value.forestQuest) || !quest(value.carpenterQuest) || typeof value.lanternBuilt !== "boolean" || (value.lanternBuilt && value.carpenterQuest !== "completed")) return null;
  return { forageDay: value.forageDay, picked: [...value.picked], forestQuest: value.forestQuest, carpenterQuest: value.carpenterQuest, lanternBuilt: value.lanternBuilt };
}

function validateIntroQuest(value: unknown): IntroQuestState | null {
  if (!object(value) || !keys(value, ["status", "cropId"])) return null;
  if (value.status === "available") return value.cropId === null ? initialIntroQuest() : null;
  if ((value.status === "active" || value.status === "completed") && typeof value.cropId === "string" && CROPS.some(crop => crop.id === value.cropId)) {
    return { status: value.status, cropId: value.cropId };
  }
  return null;
}

function validateDaily(value: unknown): DailyState | null {
  if (!object(value) || !keys(value, ["minute", "energy"]) || !integer(value.minute, 360, 1320) || value.minute % 10 !== 0 || !integer(value.energy, 0, 100)) return null;
  return { minute: value.minute, energy: value.energy };
}

function validateContainer(value: unknown): InventoryState | null {
  if (!object(value) || !keys(value, ["capacity", "slots"]) || value.capacity !== INVENTORY_CAPACITY || !Array.isArray(value.slots) || value.slots.length !== INVENTORY_CAPACITY) return null;
  const slots: InventoryState["slots"] = [];
  for (const slot of value.slots) {
    if (slot === null) { slots.push(null); continue; }
    if (!object(slot) || !keys(slot, ["itemId", "amount"]) || typeof slot.itemId !== "string") return null;
    const item = ITEMS.find(i => i.id === slot.itemId);
    if (!item || !integer(slot.amount, 1, item.maxStack)) return null;
    slots.push({ itemId: item.id, amount: slot.amount });
  }
  return { capacity: INVENTORY_CAPACITY, slots };
}

/** Validate the complete document before any service restoration. Never coerce values. */
function validate(data: unknown): SaveData | null {
  if (!object(data) || !integer(data.gold, 0, MAX_GOLD) || !integer(data.day, 1, MAX_DAY)) return null;
  if (data.version === 1) {
    if (!keys(data, ["version", "gold", "day"])) return null;
    return { version: SAVE_VERSION, gold: data.gold, day: data.day, farming: [], inventory: initialInventory(), chest: emptyContainer(), daily: initialDaily(), introQuest: initialIntroQuest(), exploration: initialExploration(data.day), fishingQuest: initialFishingQuest() };
  }
  if (data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== 5 && data.version !== 6 && data.version !== SAVE_VERSION) return null;
  const previousVersion = data.version === 2;
  const hasDaily = data.version >= 4;
  const hasIntroQuest = data.version >= 5;
  const hasExploration = data.version >= 6;
  const hasFishingQuest = data.version === 7;
  if (!keys(data, ["version", "gold", "day", "inventory", "farming", ...(previousVersion ? [] : ["chest"]), ...(hasDaily ? ["daily"] : []), ...(hasIntroQuest ? ["introQuest"] : []), ...(hasExploration ? ["exploration"] : []), ...(hasFishingQuest ? ["fishingQuest"] : [])])) return null;
  const inventory = validateContainer(data.inventory);
  const chest = previousVersion ? emptyContainer() : validateContainer(data.chest);
  const daily = hasDaily ? validateDaily(data.daily) : initialDaily();
  const introQuest = hasIntroQuest ? validateIntroQuest(data.introQuest) : initialIntroQuest();
  const exploration = hasExploration ? validateExploration(data.exploration, data.day) : initialExploration(data.day);
  const fishingQuest = hasFishingQuest ? validateFishingQuest(data.fishingQuest) : initialFishingQuest();
  if (!inventory || !chest || !daily || !introQuest || !exploration || !fishingQuest) return null;
  if (!Array.isArray(data.farming) || data.farming.length > FARM01.length * FARM01[0].length) return null;
  const farming: FarmTileState[] = [];
  const seen = new Set<string>();
  for (const tile of data.farming) {
    if (!object(tile) || !keys(tile, ["id", "tilled", "watered"], ["crop"]) || typeof tile.id !== "string" || tile.tilled !== true || typeof tile.watered !== "boolean") return null;
    if (!/^(0|[1-9]\d*)_(0|[1-9]\d*)$/.test(tile.id) || seen.has(tile.id)) return null;
    const [row, col] = tile.id.split("_").map(Number);
    if (!integer(row, 0, FARM01.length - 1) || !integer(col, 0, FARM01[row].length - 1)) return null;
    if (![".", "S", "H"].includes(FARM01[row][col])) return null;
    seen.add(tile.id);
    const next: FarmTileState = { id: tile.id, tilled: true, watered: tile.watered };
    if (Object.prototype.hasOwnProperty.call(tile, "crop")) {
      const crop = tile.crop;
      if (!object(crop) || !keys(crop, ["cropId", "growthDay", "harvestedCount"]) || typeof crop.cropId !== "string") return null;
      const def = CROPS.find(c => c.id === crop.cropId);
      if (!def || !integer(crop.harvestedCount, 0, MAX_DAY) || (!def.repeatHarvest && crop.harvestedCount !== 0)) return null;
      const threshold = def.repeatHarvest && crop.harvestedCount > 0 ? def.regrowDays ?? def.growDays : def.growDays;
      if (!integer(crop.growthDay, 0, threshold)) return null;
      next.crop = { cropId: def.id, growthDay: crop.growthDay, harvestedCount: crop.harvestedCount };
    }
    farming.push(next);
  }
  return { version: SAVE_VERSION, gold: data.gold, day: data.day, inventory, chest, farming, daily, introQuest, exploration, fishingQuest };
}

function parse(raw: string | null): SaveData | null {
  if (raw === null || !bounded(raw)) return null;
  try { return validate(JSON.parse(raw)); } catch { return null; }
}

/** Complete writes are validated; previous valid bytes are backed up before replacing the primary. */
export class SaveManager {
  constructor(private readonly storage: SaveStorage) {}

  /** Compatibility for old callers supplying only gold/day; new sessions supply all fields. */
  save(data: Pick<SaveData, "gold" | "day"> & Partial<Pick<SaveData, "inventory" | "farming" | "chest" | "daily" | "introQuest" | "exploration" | "fishingQuest">>): boolean {
    try {
      if ((data.inventory === undefined) !== (data.farming === undefined)) return false;
      if (data.chest !== undefined && data.inventory === undefined) return false;
      const payload = validate({ ...data, version: SAVE_VERSION, inventory: data.inventory ?? initialInventory(), farming: data.farming ?? [], chest: data.chest ?? emptyContainer(), daily: data.daily === undefined ? initialDaily() : data.daily, introQuest: data.introQuest === undefined ? initialIntroQuest() : data.introQuest, exploration: data.exploration === undefined ? initialExploration(data.day) : data.exploration, fishingQuest: data.fishingQuest === undefined ? initialFishingQuest() : data.fishingQuest });
      if (!payload) return false;
      const encoded = JSON.stringify(payload);
      if (!bounded(encoded)) return false;
      const current = this.storage.get(SAVE_KEY);
      // Never silently overwrite corrupted data or an unsupported newer save.
      if (current !== null && !parse(current)) return false;
      if (current !== null) this.storage.set(SAVE_BACKUP_KEY, current);
      this.storage.set(SAVE_KEY, encoded);
      return true;
    } catch { return false; }
  }

  load(): SaveData | null {
    try { return parse(this.storage.get(SAVE_KEY)); } catch { return null; }
  }

  hasStoredData(): boolean {
    try { return this.storage.get(SAVE_KEY) !== null; } catch { return true; }
  }

  hasBackup(): boolean {
    try { return parse(this.storage.get(SAVE_BACKUP_KEY)) !== null; } catch { return false; }
  }

  restoreBackup(): boolean {
    try {
      const raw = this.storage.get(SAVE_BACKUP_KEY);
      if (!parse(raw)) return false;
      const current = this.storage.get(SAVE_KEY);
      if (current !== null) {
        if (!bounded(current)) return false;
        this.storage.set(SAVE_RECOVERY_KEY, current);
      }
      this.storage.set(SAVE_KEY, raw!);
      return true;
    } catch { return false; }
  }

  /** Explicit new-game clearing keeps valid previous saves recoverable. */
  clear(): boolean {
    try {
      const current = this.storage.get(SAVE_KEY);
      if (current !== null) {
        if (!bounded(current)) return false;
        this.storage.set(parse(current) ? SAVE_BACKUP_KEY : SAVE_RECOVERY_KEY, current);
      }
      this.storage.remove(SAVE_KEY);
      return true;
    } catch { return false; }
  }
}
