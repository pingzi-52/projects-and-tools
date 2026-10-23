import type { DailyState, Season } from "../models/types";
import type { WeatherState, WeatherType } from "../models/Weather";

const MORNING = 360;
const NIGHT = 1320;
const WEATHER: readonly WeatherType[] = ["sunny", "cloudy", "rain", "sunny", "sunny", "rain", "cloudy"];

/** Deterministic daily weather; no RNG, real-world clock or persistence is needed. */
export function weatherForDay(day: number, season: Season): WeatherState {
  if (!Number.isSafeInteger(day) || day < 1) throw new RangeError("Invalid weather day");
  const planned = WEATHER[(day - 1) % WEATHER.length];
  const type = season === "winter" && planned === "rain" ? "cloudy" : planned;
  return { type, autoWater: type === "rain" };
}

/** Time and energy are independent of movement, menus and farming rules. */
export class DailyLifeService {
  private currentMinute = MORNING;
  private currentEnergy = 100;
  private accumulatedMs = 0;

  get minute(): number { return this.currentMinute; }
  get energy(): number { return this.currentEnergy; }
  get isLate(): boolean { return this.currentMinute >= NIGHT; }
  get clockText(): string {
    return `${String(Math.floor(this.currentMinute / 60)).padStart(2, "0")}:${String(this.currentMinute % 60).padStart(2, "0")}`;
  }

  serialize(): DailyState { return { minute: this.currentMinute, energy: this.currentEnergy }; }

  restore(state: DailyState): void {
    if (!state || !Number.isInteger(state.minute) || state.minute % 10 !== 0 || state.minute < MORNING || state.minute > NIGHT
      || !Number.isInteger(state.energy) || state.energy < 0 || state.energy > 100) {
      throw new RangeError("Invalid daily state");
    }
    this.currentMinute = state.minute;
    this.currentEnergy = state.energy;
    this.accumulatedMs = 0;
  }

  resetMorning(): void {
    this.currentMinute = MORNING;
    this.currentEnergy = 100;
    this.accumulatedMs = 0;
  }

  canSpend(cost: number): boolean {
    return Number.isSafeInteger(cost) && cost >= 0 && cost <= this.currentEnergy;
  }
  spend(cost: number): boolean {
    if (!this.canSpend(cost)) return false;
    this.currentEnergy -= cost;
    return true;
  }

  /** Restores energy without resetting the current clock tick. */
  recover(amount: number): boolean {
    if (!Number.isSafeInteger(amount) || amount < 0) return false;
    this.currentEnergy = Math.min(100, this.currentEnergy + amount);
    return true;
  }

  advance(deltaMs: number): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.isLate) return false;
    this.accumulatedMs += Math.min(deltaMs, 1000);
    if (this.accumulatedMs < 7000) return false;
    this.accumulatedMs -= 7000;
    this.currentMinute = Math.min(NIGHT, this.currentMinute + 10);
    if (this.isLate) this.accumulatedMs = 0;
    return true;
  }
}
