export type FishId = "silver_crucian" | "sun_carp";

export interface FishDefinition {
  readonly id: FishId;
  readonly name: string;
  readonly sellPrice: number;
}

export const FISHING_COST = 4;

export const FISHES: readonly FishDefinition[] = [
  { id: "silver_crucian", name: "银鳞鲫", sellPrice: 24 },
  { id: "sun_carp", name: "日纹鲤", sellPrice: 40 },
];
