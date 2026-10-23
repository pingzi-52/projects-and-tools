import { describe, expect, it } from "vitest";
import { initGameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager, MAX_GOLD } from "../src/persistence/save";
import { SAVE_KEY } from "../src/domain/models/types";

function setup() {
  const storage = new MemoryStorage();
  const session = initGameSession(new SaveManager(storage));
  session.newGame();
  return { session, storage };
}
function snapshot(s: ReturnType<typeof setup>["session"]) {
  return { inventory: s.inventory.serialize(), daily: s.life.serialize(), gold: s.economy.goldValue, exploration: s.exploration.serialize() };
}
function full(s: ReturnType<typeof setup>["session"]) { s.inventory.restore({ capacity: 24, slots: Array.from({length:24}, () => ({itemId:"hoe",amount:1})) }); }

describe("exploration transactions", () => {
  it("gathers once per node, spends two energy and persists the daily quota", () => {
    const { session: s, storage } = setup();
    expect(s.gatherNode("wood_a").ok).toBe(true);
    expect(s.inventory.count("branch")).toBe(1); expect(s.life.energy).toBe(98);
    const before = snapshot(s);
    expect(s.gatherNode("wood_a")).toEqual({ok:false,reason:"ALREADY_PICKED"});
    expect(snapshot(s)).toEqual(before);
    const loaded = initGameSession(new SaveManager(storage)); expect(loaded.loadGame()).toBe(true);
    expect(loaded.exploration.state.picked).toEqual(["wood_a"]);
    expect(loaded.gatherNode("wood_a").ok).toBe(false);
    loaded.sleep(); expect(loaded.exploration.state.picked).toEqual([]);
    expect(loaded.exploration.state.forageDay).toBe(2);
    expect(loaded.gatherNode("wood_a").ok).toBe(true);
  });
  it("rejects unknown IDs, full bags and exhausted gathering without mutation", () => {
    const { session:s } = setup(); const initial = snapshot(s);
    expect(s.gatherNode("unknown")).toEqual({ok:false,reason:"UNKNOWN_NODE"}); expect(snapshot(s)).toEqual(initial);
    full(s); const packed=snapshot(s); expect(s.gatherNode("stone_a")).toEqual({ok:false,reason:"INVENTORY_FULL"}); expect(snapshot(s)).toEqual(packed);
    s.inventory.restore(initial.inventory); s.life.spend(100); const tired=snapshot(s);
    expect(s.gatherNode("stone_a")).toEqual({ok:false,reason:"TOO_TIRED"}); expect(snapshot(s)).toEqual(tired);
  });
  it("uses the last stack space without requiring a new slot", () => {
    const {session:s}=setup(); full(s); const bag=s.inventory.serialize(); bag.slots[0]={itemId:"branch",amount:98}; s.inventory.restore(bag);
    expect(s.gatherNode("wood_a").ok).toBe(true); expect(s.inventory.count("branch")).toBe(99);
    const before=snapshot(s); expect(s.gatherNode("wood_b").ok).toBe(false); expect(snapshot(s)).toEqual(before);
  });
  it("rolls back energy, quota, bag, quest and gold when storage fails", () => {
    const {session:s,storage}=setup(); expect(s.saveGame()).toBe(true); const raw=storage.get(SAVE_KEY);
    storage.set=()=>{throw new Error("blocked");}; const before=snapshot(s);
    expect(s.gatherNode("mushroom_a")).toEqual({ok:false,reason:"SAVE_FAILED"}); expect(snapshot(s)).toEqual(before);
    expect(s.acceptExplorationQuest("forest")).toEqual({ok:false,reason:"SAVE_FAILED"}); expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
  it.each(["forest","carpenter"] as const)("completes %s once, with exact materials and rewards", kind => {
    const {session:s}=setup(); expect(s.completeExplorationQuest(kind).ok).toBe(false);
    expect(s.acceptExplorationQuest(kind).ok).toBe(true); expect(s.acceptExplorationQuest(kind).ok).toBe(false);
    const before=snapshot(s); expect(s.completeExplorationQuest(kind).ok).toBe(false); expect(snapshot(s)).toEqual(before);
    if(kind==="forest") s.inventory.add("wild_mushroom",3); else {s.inventory.add("branch",6);s.inventory.add("stone",4);}
    expect(s.completeExplorationQuest(kind).ok).toBe(true); expect(s.economy.goldValue).toBe(kind==="forest"?580:640);
    expect(s.exploration.state[kind==="forest"?"forestQuest":"carpenterQuest"]).toBe("completed");
    const completed=snapshot(s); expect(s.completeExplorationQuest(kind).ok).toBe(false); expect(snapshot(s)).toEqual(completed);
  });
  it("blocks reward overflow and rolls back every failed delivery write", () => {
    const {session:s,storage}=setup(); s.acceptExplorationQuest("carpenter");s.inventory.add("branch",6);s.inventory.add("stone",4);
    s.economy.setGold(MAX_GOLD); const before=snapshot(s);
    expect(s.completeExplorationQuest("carpenter")).toEqual({ok:false,reason:"GOLD_LIMIT"}); expect(snapshot(s)).toEqual(before);
    s.economy.setGold(500); const payable=snapshot(s); storage.set=()=>{throw new Error("blocked");};
    expect(s.completeExplorationQuest("carpenter")).toEqual({ok:false,reason:"SAVE_FAILED"}); expect(snapshot(s)).toEqual(payable);
  });
  it("requires both recipe materials and carpenter unlock, then builds one lantern", () => {
    const {session:s}=setup();s.inventory.add("branch",10);s.inventory.add("stone",7);
    expect(s.craftItem("farm_lantern")).toEqual({ok:false,reason:"RECIPE_LOCKED"});
    s.acceptExplorationQuest("carpenter");s.completeExplorationQuest("carpenter");
    expect(s.craftItem("farm_lantern").ok).toBe(true); expect(s.exploration.state.lanternBuilt).toBe(true);
    expect(s.inventory.count("branch")).toBe(0);expect(s.inventory.count("stone")).toBe(0);
    const before=snapshot(s);expect(s.craftItem("farm_lantern")).toEqual({ok:false,reason:"ALREADY_BUILT"});expect(snapshot(s)).toEqual(before);
    s.sleep();expect(s.exploration.state.lanternBuilt).toBe(true);expect(s.exploration.state.carpenterQuest).toBe("completed");
  });
  it("crafts a meal after freeing the consumed material slot, and eats from zero energy", () => {
    const {session:s}=setup();full(s);const bag=s.inventory.serialize();bag.slots[0]={itemId:"wild_mushroom",amount:2};s.inventory.restore(bag);
    expect(s.craftItem("mushroom_meal").ok).toBe(true);expect(s.inventory.count("wild_mushroom")).toBe(0);expect(s.inventory.count("mushroom_meal")).toBe(1);
    const before=snapshot(s);expect(s.eatMeal()).toEqual({ok:false,reason:"ENERGY_FULL"});expect(snapshot(s)).toEqual(before);
    s.life.spend(100);expect(s.eatMeal().ok).toBe(true);expect(s.life.energy).toBe(25);expect(s.inventory.count("mushroom_meal")).toBe(0);
    s.inventory.remove("hoe",1);s.inventory.add("mushroom_meal",1);s.life.restore({minute:360,energy:90});expect(s.eatMeal().ok).toBe(true);expect(s.life.energy).toBe(100);
  });
  it("does not partially consume recipes when output cannot fit", () => {
    const {session:s}=setup();full(s);const bag=s.inventory.serialize();bag.slots[0]={itemId:"wild_mushroom",amount:3};s.inventory.restore(bag);
    const before=snapshot(s);expect(s.craftItem("mushroom_meal")).toEqual({ok:false,reason:"INVENTORY_FULL"});expect(snapshot(s)).toEqual(before);
    expect(s.craftItem("unknown" as "mushroom_meal")).toEqual({ok:false,reason:"UNKNOWN_RECIPE"});expect(snapshot(s)).toEqual(before);
  });
  it("rolls back cooking and eating writes", () => {
    const {session:s,storage}=setup();s.inventory.add("wild_mushroom",2);s.inventory.add("mushroom_meal",1);s.life.spend(50);
    const before=snapshot(s);storage.set=()=>{throw new Error("blocked");};
    expect(s.craftItem("mushroom_meal")).toEqual({ok:false,reason:"SAVE_FAILED"});expect(snapshot(s)).toEqual(before);
    expect(s.eatMeal()).toEqual({ok:false,reason:"SAVE_FAILED"});expect(snapshot(s)).toEqual(before);
  });
  it("preserves partial clock ticks through successful eating and failed rollback", () => {
    const {session:s,storage}=setup();s.inventory.add("mushroom_meal",2);s.life.spend(50);
    for(let i=0;i<6;i++) expect(s.advanceTime(1000)).toBe(false);
    expect(s.eatMeal().ok).toBe(true);expect(s.life.energy).toBe(75);expect(s.advanceTime(1000)).toBe(true);
    for(let i=0;i<6;i++) expect(s.advanceTime(1000)).toBe(false);
    storage.set=()=>{throw new Error("blocked");};expect(s.eatMeal()).toEqual({ok:false,reason:"SAVE_FAILED"});expect(s.life.energy).toBe(75);
    expect(s.advanceTime(1000)).toBe(true);expect(s.life.minute).toBe(380);
  });
  it("sells only priced materials or crops, and restores materials on save failure", () => {
    const {session:s,storage}=setup();s.inventory.add("branch",3);s.inventory.add("stone",1);s.inventory.add("wild_mushroom",1);s.inventory.add("mushroom_meal",1);
    expect(s.sellItem("branch",2).ok).toBe(true);expect(s.sellItem("stone",1).ok).toBe(true);expect(s.sellItem("wild_mushroom",1).ok).toBe(true);expect(s.economy.goldValue).toBe(527);
    expect(s.sellItem("mushroom_meal",1)).toEqual({ok:false,reason:"NOT_SELLABLE"});expect(s.sellItem("hoe",1).ok).toBe(false);
    const before=snapshot(s);storage.set=()=>{throw new Error("blocked");};expect(s.sellItem("branch",1)).toEqual({ok:false,reason:"SAVE_FAILED"});expect(snapshot(s)).toEqual(before);
  });
  it("migrates V5 without changing the existing farm, chest, quest or daily state", () => {
    const {session:s,storage}=setup();s.time.setDay(8);s.economy.setGold(777);s.inventory.add("dew_radish_seed",4);s.chest.add("morning_bean",3);
    s.farming.restore({"8_12":{id:"8_12",tilled:true,watered:true,crop:{cropId:"dew_radish",growthDay:2,harvestedCount:0}}});
    s.life.restore({minute:680,energy:37});s.introQuest.accept("spring");expect(s.saveGame()).toBe(true);
    const current=JSON.parse(storage.get(SAVE_KEY)!);delete current.exploration;delete current.fishingQuest;current.version=5;const raw=JSON.stringify(current);storage.set(SAVE_KEY,raw);
    const loaded=initGameSession(new SaveManager(storage));expect(loaded.loadGame()).toBe(true);
    expect(loaded.inventory.serialize()).toEqual(current.inventory);expect(loaded.chest.serialize()).toEqual(current.chest);expect(Object.values(loaded.farming.serialize())).toEqual(current.farming);
    expect(loaded.life.serialize()).toEqual(current.daily);expect(loaded.introQuest.state).toEqual(current.introQuest);expect(loaded.economy.goldValue).toBe(777);
    expect(loaded.exploration.state).toEqual({forageDay:8,picked:[],forestQuest:"available",carpenterQuest:"available",lanternBuilt:false});expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(loaded.gatherNode("wood_a").ok).toBe(true);expect(JSON.parse(storage.get(SAVE_KEY)!).version).toBe(7);
  });
  it("normalizes stale daily depletion on load but protects future version 8 unchanged", () => {
    const {session:s,storage}=setup();s.gatherNode("wood_a");s.saveGame();const data=JSON.parse(storage.get(SAVE_KEY)!);data.day=4;storage.set(SAVE_KEY,JSON.stringify(data));
    expect(s.loadGame()).toBe(true);expect(s.exploration.state.forageDay).toBe(4);expect(s.exploration.state.picked).toEqual([]);
    data.version=8;const raw=JSON.stringify(data);storage.set(SAVE_KEY,raw);const before=snapshot(s);
    expect(s.loadGame()).toBe(false);expect(snapshot(s)).toEqual(before);expect(s.saveGame()).toBe(false);expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.gatherNode("wood_a")).toEqual({ok:false,reason:"SAVE_FAILED"});expect(snapshot(s)).toEqual(before);
  });
  it("new game clears exploration milestones along with inventory and clock", () => {
    const {session:s}=setup();s.acceptExplorationQuest("carpenter");s.inventory.add("branch",10);s.inventory.add("stone",7);s.completeExplorationQuest("carpenter");s.craftItem("farm_lantern");s.gatherNode("wood_a");s.sleep();
    s.newGame();expect(s.exploration.state).toEqual({forageDay:1,picked:[],forestQuest:"available",carpenterQuest:"available",lanternBuilt:false});expect(s.life.energy).toBe(100);expect(s.inventory.count("branch")).toBe(0);
  });
  it("checks every ingredient before consuming any, then rolls lantern state back on failed save", () => {
    const {session:s,storage}=setup();s.acceptExplorationQuest("carpenter");s.inventory.add("branch",6);const partial=snapshot(s);
    expect(s.completeExplorationQuest("carpenter")).toEqual({ok:false,reason:"NOT_ENOUGH"});expect(snapshot(s)).toEqual(partial);
    s.inventory.add("stone",4);s.completeExplorationQuest("carpenter");s.inventory.add("branch",4);const missingStone=snapshot(s);
    expect(s.craftItem("farm_lantern")).toEqual({ok:false,reason:"NOT_ENOUGH"});expect(snapshot(s)).toEqual(missingStone);
    s.inventory.add("stone",3);const before=snapshot(s);storage.set=()=>{throw new Error("blocked");};
    expect(s.craftItem("farm_lantern")).toEqual({ok:false,reason:"SAVE_FAILED"});expect(snapshot(s)).toEqual(before);
  });
  it("keeps a valid maximum-day save unchanged when sleeping, without partial crop or life changes", () => {
    const {session:s,storage}=setup();s.time.setDay(1_000_000);s.exploration.beginDay(1_000_000);s.gatherNode("wood_a");s.acceptExplorationQuest("forest");
    s.life.restore({minute:1320,energy:3});s.farming.restore({"8_12":{id:"8_12",tilled:true,watered:true,crop:{cropId:"dew_radish",growthDay:2,harvestedCount:0}}});
    expect(s.saveGame()).toBe(true);const raw=storage.get(SAVE_KEY);const before={date:s.time.date,farm:s.farming.serialize(),state:snapshot(s)};
    expect(s.sleep()).toEqual(before.date);expect({date:s.time.date,farm:s.farming.serialize(),state:snapshot(s)}).toEqual(before);expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.saveGame()).toBe(true);expect(JSON.parse(storage.get(SAVE_KEY)!).day).toBe(1_000_000);
  });
});
