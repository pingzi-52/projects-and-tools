import { describe, expect, it } from "vitest";
import { FORAGE_NODES, RECIPES, EXPLORATION_QUESTS } from "../src/data/exploration";
import { ExplorationService } from "../src/domain/services/ExplorationService";
import { getItem } from "../src/data/items";
import type { ExplorationState } from "../src/domain/models/types";

describe("exploration state and definitions", () => {
  it("exports unique known node materials, nonzero recipes and delivery requirements", () => {
    expect(new Set(FORAGE_NODES.map(node=>node.id)).size).toBe(9);
    for(const node of FORAGE_NODES) expect(getItem(node.itemId)?.maxStack).toBe(99);
    for(const recipe of Object.values(RECIPES)) for(const material of recipe.ingredients) { expect(getItem(material.itemId)).toBeDefined(); expect(material.amount).toBeGreaterThan(0); }
    for(const quest of Object.values(EXPLORATION_QUESTS)) {expect(quest.reward).toBeGreaterThan(0);for(const material of quest.requirements) expect(getItem(material.itemId)).toBeDefined();}
  });
  it("clones all external snapshots and restores stale depletion to the requested day", () => {
    const service=new ExplorationService(3);service.gather("wood_a");service.acceptQuest("forest");
    const copy=service.state;copy.picked.push("wood_b");copy.forestQuest="completed";
    expect(service.state.picked).toEqual(["wood_a"]);expect(service.state.forestQuest).toBe("active");
    const restored=new ExplorationService();const source=service.serialize();restored.restore(source,4);source.picked.push("wood_c");
    expect(restored.state).toEqual({forageDay:4,picked:[],forestQuest:"active",carpenterQuest:"available",lanternBuilt:false});
    restored.gather("stone_a");restored.beginDay(4);expect(restored.state.picked).toEqual(["stone_a"]);
    restored.newGame();expect(restored.state).toEqual({forageDay:1,picked:[],forestQuest:"available",carpenterQuest:"available",lanternBuilt:false});
  });
  it("validates restore before mutation including day bounds, identity duplication and lantern unlock", () => {
    const service=new ExplorationService();service.gather("mushroom_a");const before=service.state;
    const invalid:unknown[]=[null,{}, {...before,forageDay:0},{...before,forageDay:2},{...before,picked:["wood_a","wood_a"]},{...before,picked:["unknown"]},{...before,picked:null},{...before,forestQuest:"unknown"},{...before,carpenterQuest:"unknown"},{...before,lanternBuilt:1},{...before,lanternBuilt:true},{...before,extra:1}];
    for(const state of invalid){expect(()=>service.restore(state as ExplorationState,1)).toThrow(RangeError);expect(service.state).toEqual(before);}
    for(const day of [0,-1,1.5,NaN,Infinity,1_000_001]){expect(()=>new ExplorationService(day)).toThrow(RangeError);expect(()=>service.beginDay(day)).toThrow(RangeError);}
  });
  it("does not permit unknown quest keys or repeated milestones", () => {
    const service=new ExplorationService();expect(service.acceptQuest("bad" as "forest")).toEqual({ok:false,reason:"UNKNOWN_QUEST"});
    expect(service.completeQuest("bad" as "forest")).toEqual({ok:false,reason:"UNKNOWN_QUEST"});expect(service.buildLantern().ok).toBe(false);
    service.acceptQuest("carpenter");service.completeQuest("carpenter");expect(service.buildLantern().ok).toBe(true);
    expect(service.buildLantern()).toEqual({ok:false,reason:"ALREADY_BUILT"});service.beginDay(2);expect(service.state.lanternBuilt).toBe(true);
  });
});
