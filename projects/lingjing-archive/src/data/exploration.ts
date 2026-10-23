/** Stable node identities are saved; scenes own their visual positions. */
export const FORAGE_NODES = [
  { id: "wood_a", itemId: "branch", name: "枯枝" },
  { id: "wood_b", itemId: "branch", name: "枯枝" },
  { id: "wood_c", itemId: "branch", name: "枯枝" },
  { id: "stone_a", itemId: "stone", name: "溪石" },
  { id: "stone_b", itemId: "stone", name: "溪石" },
  { id: "stone_c", itemId: "stone", name: "溪石" },
  { id: "mushroom_a", itemId: "wild_mushroom", name: "野蘑菇" },
  { id: "mushroom_b", itemId: "wild_mushroom", name: "野蘑菇" },
  { id: "mushroom_c", itemId: "wild_mushroom", name: "野蘑菇" },
] as const;

export type ExplorationQuestKind = "forest" | "carpenter";
export interface Ingredient { itemId: string; amount: number }
export interface ExplorationQuestDefinition { name: string; requirements: readonly Ingredient[]; reward: number }
export const EXPLORATION_QUESTS: Readonly<Record<ExplorationQuestKind, ExplorationQuestDefinition>> = {
  forest: { name: "林间的馈赠", requirements: [{ itemId: "wild_mushroom", amount: 3 }], reward: 80 },
  carpenter: { name: "修缮的材料", requirements: [{ itemId: "branch", amount: 6 }, { itemId: "stone", amount: 4 }], reward: 140 },
};
export type RecipeId = "mushroom_meal" | "farm_lantern";
export interface RecipeDefinition { id: RecipeId; name: string; ingredients: readonly Ingredient[]; output: Ingredient | null; requiresCarpenter: boolean }
export const RECIPES: Readonly<Record<RecipeId, RecipeDefinition>> = {
  mushroom_meal: { id: "mushroom_meal", name: "菌菇餐", ingredients: [{ itemId: "wild_mushroom", amount: 2 }], output: { itemId: "mushroom_meal", amount: 1 }, requiresCarpenter: false },
  farm_lantern: { id: "farm_lantern", name: "农场提灯", ingredients: [{ itemId: "branch", amount: 4 }, { itemId: "stone", amount: 3 }], output: null, requiresCarpenter: true },
};
