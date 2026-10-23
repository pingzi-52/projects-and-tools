import { describe, expect, it } from "vitest";
import { initGameSession, type GameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager } from "../src/persistence/save";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";
import { ITEMS } from "../src/data/items";
import { ItemCategory } from "../src/domain/models/Item";
import { FishingRound } from "../src/domain/services/FishingRound";
import { FISHES } from "../src/data/fishing";

const fishIds = ["silver_crucian", "sun_carp"] as const;

function setup() {
  const storage = new MemoryStorage();
  const session = initGameSession(new SaveManager(storage));
  session.newGame();
  return { session, storage };
}

function snapshot(session: GameSession) {
  return {
    inventory: session.inventory.serialize(), chest: session.chest.serialize(),
    daily: session.life.serialize(), gold: session.economy.goldValue,
    exploration: session.exploration.serialize(),
  };
}

function full(session: GameSession) {
  session.inventory.restore({ capacity: 24, slots: Array.from({ length: 24 }, () => ({ itemId: "hoe", amount: 1 })) });
}

// Transaction tests inject only the round's ephemeral input. The real round's
// consume/cancel methods still enforce and clear the claimed catch.
function roundState(session: GameSession, phase: string, fishId: string | null = null) {
  (session.fishing as unknown as { current: object }).current = {
    ...session.fishing.state, phase, fishId,
  };
}

describe("fishing session rewards", () => {
  it("exposes a temporary round and guarded fishing operations", () => {
    const { session } = setup();
    expect(typeof session.castFishing).toBe("function");
    expect(typeof session.landFish).toBe("function");
    expect(typeof session.cancelFishing).toBe("function");
    expect(session.fishing.state.phase).toBe("idle");
  });

  it.each(fishIds)("registers %s as a stackable sellable material", itemId => {
    const item = ITEMS.find(item => item.id === itemId);
    expect(item).toMatchObject({ category: ItemCategory.Material, maxStack: 99, stackable: true, sellPrice: itemId === "silver_crucian" ? 24 : 40 });
    expect(item).toMatchObject(FISHES.find(fish => fish.id === itemId)!);
  });

  it.each(fishIds)("lands %s after the real waiting and three-hit round", itemId => {
    const { session } = setup();
    session.fishing = new FishingRound(() => itemId === "silver_crucian" ? 0 : 0.99);
    expect(session.castFishing().ok).toBe(true);
    for (let i = 0; i < 50 && session.fishing.state.phase === "waiting"; i++) session.fishing.update(100);
    expect(session.fishing.state.phase).toBe("bite");
    session.fishing.tap();
    for (const elapsed of [300, 300, 900]) {
      for (let i = 0; i < elapsed / 100; i++) session.fishing.update(100);
      expect(session.fishing.state.inZone).toBe(true);
      session.fishing.tap();
    }
    expect(session.fishing.state).toMatchObject({ phase: "caught", fishId: itemId });
    expect(session.life.energy).toBe(100);
    expect(session.landFish()).toEqual({ ok: true, value: { itemId } });
    expect(session.inventory.count(itemId)).toBe(1);
    expect(session.life.energy).toBe(96);
  });

  it("casts without spending energy or writing, and refuses another active cast", () => {
    const { session, storage } = setup();
    const before = snapshot(session);
    expect(session.castFishing()).toEqual({ ok: true, value: undefined });
    expect(session.fishing.state.phase).toBe("waiting");
    expect(snapshot(session)).toEqual(before);
    expect(storage.get(SAVE_KEY)).toBeNull();
    expect(session.castFishing()).toEqual({ ok: false, reason: "FISHING_ACTIVE" });
    expect(snapshot(session)).toEqual(before);
  });

  it.each(["waiting", "bite", "reeling", "caught"])("rejects a cast during %s without replacing the round", phase => {
    const { session } = setup();
    roundState(session, phase, "silver_crucian");
    const before = session.fishing.state;
    expect(session.castFishing()).toEqual({ ok: false, reason: "FISHING_ACTIVE" });
    expect(session.fishing.state).toEqual(before);
  });

  it("allows another cast after escape and leaves failed or cancelled rounds free", () => {
    const { session, storage } = setup();
    const before = snapshot(session);
    expect(session.castFishing().ok).toBe(true);
    session.cancelFishing();
    expect(session.fishing.state.phase).toBe("idle");
    expect(session.landFish()).toEqual({ ok: false, reason: "NO_CATCH" });
    expect(session.castFishing().ok).toBe(true);
    roundState(session, "escaped");
    expect(session.landFish()).toEqual({ ok: false, reason: "NO_CATCH" });
    expect(session.castFishing().ok).toBe(true);
    expect(snapshot(session)).toEqual(before);
    expect(storage.get(SAVE_KEY)).toBeNull();
  });

  it("can discard an unclaimed catch without spending or persisting", () => {
    const { session, storage } = setup();
    roundState(session, "caught", "sun_carp");
    const before = snapshot(session);
    session.cancelFishing();
    expect(snapshot(session)).toEqual(before);
    expect(session.fishing.state.phase).toBe("idle");
    expect(session.landFish()).toEqual({ ok: false, reason: "NO_CATCH" });
    expect(storage.get(SAVE_KEY)).toBeNull();
  });

  it("checks energy and space for both possible fish before casting", () => {
    const { session } = setup();
    session.life.spend(97);
    const tired = snapshot(session);
    expect(session.castFishing()).toEqual({ ok: false, reason: "TOO_TIRED" });
    expect(snapshot(session)).toEqual(tired);
    session.life.recover(100);
    full(session);
    const bag = session.inventory.serialize();
    bag.slots[0] = { itemId: "silver_crucian", amount: 98 };
    session.inventory.restore(bag);
    const before = snapshot(session);
    expect(session.castFishing()).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(snapshot(session)).toEqual(before);
    expect(session.fishing.state.phase).toBe("idle");
    bag.slots[1] = { itemId: "sun_carp", amount: 98 };
    session.inventory.restore(bag);
    expect(session.castFishing().ok).toBe(true);
  });

  it.each(fishIds)("lands %s once and persists exactly one fish and four energy", itemId => {
    const { session, storage } = setup();
    roundState(session, "caught", itemId);
    expect(session.landFish()).toEqual({ ok: true, value: { itemId } });
    expect(session.inventory.count(itemId)).toBe(1);
    expect(session.life.energy).toBe(96);
    expect(session.economy.goldValue).toBe(500);
    expect(session.fishing.state.phase).toBe("idle");
    const persisted = JSON.parse(storage.get(SAVE_KEY)!);
    expect(persisted.version).toBe(SAVE_VERSION);
    expect(persisted.daily.energy).toBe(96);
    expect(persisted.inventory.slots.some((slot: { itemId: string } | null) => slot?.itemId === itemId)).toBe(true);
    expect(persisted).not.toHaveProperty("fishing");
    const before = snapshot(session);
    expect(session.landFish()).toEqual({ ok: false, reason: "NO_CATCH" });
    expect(snapshot(session)).toEqual(before);
  });

  it.each([null, "hoe", "unknown"])("rejects an invalid caught ID %s before mutation", itemId => {
    const { session, storage } = setup();
    roundState(session, "caught", itemId);
    const before = snapshot(session);
    expect(session.landFish()).toEqual({ ok: false, reason: "NO_CATCH" });
    expect(snapshot(session)).toEqual(before);
    expect(storage.get(SAVE_KEY)).toBeNull();
    expect(session.fishing.state.phase).toBe("caught");
  });

  it("rechecks energy and space on landing, preserving the catch for retry", () => {
    const { session, storage } = setup();
    expect(session.castFishing().ok).toBe(true);
    roundState(session, "caught", "sun_carp");
    session.life.spend(97);
    const tired = snapshot(session);
    expect(session.landFish()).toEqual({ ok: false, reason: "TOO_TIRED" });
    expect(snapshot(session)).toEqual(tired);
    expect(session.fishing.state.phase).toBe("caught");
    session.life.recover(1);
    full(session);
    const packed = snapshot(session);
    expect(session.landFish()).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(snapshot(session)).toEqual(packed);
    expect(storage.get(SAVE_KEY)).toBeNull();
    session.inventory.remove("hoe", 1);
    expect(session.landFish()).toEqual({ ok: true, value: { itemId: "sun_carp" } });
    expect(session.life.energy).toBe(0);
  });

  it("rolls back a failed write and awards the retained catch only once on retry", () => {
    const { session, storage } = setup();
    expect(session.saveGame()).toBe(true);
    const raw = storage.get(SAVE_KEY);
    const set = storage.set.bind(storage);
    storage.set = () => { throw new Error("blocked"); };
    roundState(session, "caught", "silver_crucian");
    const before = snapshot(session);
    expect(session.landFish()).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(session)).toEqual(before);
    expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(session.fishing.state).toMatchObject({ phase: "caught", fishId: "silver_crucian" });
    storage.set = set;
    expect(session.landFish()).toEqual({ ok: true, value: { itemId: "silver_crucian" } });
    expect(session.inventory.count("silver_crucian")).toBe(1);
    expect(session.life.energy).toBe(96);
    expect(session.landFish().ok).toBe(false);
  });

  it("keeps fractional clock time when a fishing write rolls back", () => {
    const { session, storage } = setup();
    for (let i = 0; i < 6; i++) session.advanceTime(1000);
    roundState(session, "caught", "silver_crucian");
    storage.set = () => { throw new Error("blocked"); };
    expect(session.landFish()).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(session.advanceTime(1000)).toBe(true);
    expect(session.life.minute).toBe(370);
  });

  it.each(fishIds)("saves %s in current containers, transfers it through the chest and sells for its exact price", itemId => {
    const { session, storage } = setup();
    roundState(session, "caught", itemId);
    expect(session.landFish().ok).toBe(true);
    expect(session.transferChest(itemId, 1, "deposit").ok).toBe(true);
    const loaded = initGameSession(new SaveManager(storage));
    expect(loaded.loadGame()).toBe(true);
    expect(loaded.chest.count(itemId)).toBe(1);
    expect(loaded.inventory.count(itemId)).toBe(0);
    expect(loaded.fishing.state.phase).toBe("idle");
    expect(loaded.transferChest(itemId, 1, "withdraw").ok).toBe(true);
    expect(loaded.sellItem(itemId, 1).ok).toBe(true);
    expect(loaded.economy.goldValue).toBe(500 + (itemId === "silver_crucian" ? 24 : 40));
    expect(loaded.inventory.count(itemId)).toBe(0);
    const restored = initGameSession(new SaveManager(storage));
    expect(restored.loadGame()).toBe(true);
    expect(restored.economy.goldValue).toBe(loaded.economy.goldValue);
    expect(SAVE_VERSION).toBe(7);
  });

  it("restores a current fish directly from the inventory", () => {
    const { session, storage } = setup();
    roundState(session, "caught", "silver_crucian");
    expect(session.landFish().ok).toBe(true);
    const loaded = initGameSession(new SaveManager(storage));
    expect(loaded.loadGame()).toBe(true);
    expect(loaded.inventory.count("silver_crucian")).toBe(1);
    expect(loaded.life.energy).toBe(96);
  });

  it("rolls back fish transfer and sale if persistence fails", () => {
    const { session, storage } = setup();
    roundState(session, "caught", "sun_carp");
    expect(session.landFish().ok).toBe(true);
    const before = snapshot(session);
    const raw = storage.get(SAVE_KEY);
    storage.set = () => { throw new Error("blocked"); };
    expect(session.transferChest("sun_carp", 1, "deposit")).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(session)).toEqual(before);
    expect(session.sellItem("sun_carp", 1)).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(session)).toEqual(before);
    expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it.each([1, 2, 3, 4, 5, 6])("still migrates a valid V%s save and clears the current temporary round", version => {
    const { session, storage } = setup();
    session.inventory.add("dew_radish", 2);
    session.economy.setGold(777);
    expect(session.saveGame()).toBe(true);
    const data = JSON.parse(storage.get(SAVE_KEY)!);
    data.version = version;
    delete data.fishingQuest;
    if (version < 6) delete data.exploration;
    if (version < 5) delete data.introQuest;
    if (version < 4) delete data.daily;
    if (version < 3) delete data.chest;
    if (version < 2) { delete data.inventory; delete data.farming; }
    storage.set(SAVE_KEY, JSON.stringify(data));
    roundState(session, "caught", "sun_carp");
    expect(session.loadGame()).toBe(true);
    expect(session.economy.goldValue).toBe(777);
    expect(session.inventory.count("dew_radish")).toBe(version === 1 ? 0 : 2);
    expect(session.fishing.state.phase).toBe("idle");
  });

  it("does not discard the current round when loading fails", () => {
    const { session, storage } = setup();
    roundState(session, "caught", "sun_carp");
    storage.set(SAVE_KEY, "broken");
    const before = session.fishing.state;
    expect(session.loadGame()).toBe(false);
    expect(session.fishing.state).toEqual(before);
  });

  it.each(["newGame", "sleep"] as const)("clears the temporary round on %s without awarding fish", operation => {
    const { session } = setup();
    roundState(session, "caught", "sun_carp");
    session[operation]();
    expect(session.fishing.state.phase).toBe("idle");
    expect(session.inventory.count("sun_carp")).toBe(0);
    expect(session.life.energy).toBe(100);
  });

  it("clears the round when sleep is blocked at the day limit", () => {
    const { session } = setup();
    session.time.setDay(1_000_000);
    roundState(session, "caught", "sun_carp");
    session.sleep();
    expect(session.time.date.day).toBe(1_000_000);
    expect(session.fishing.state.phase).toBe("idle");
  });
});
