import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { ITEMS } from "../src/data/items";
import { ItemCategory } from "../src/domain/models/Item";
import { getItemVisual, ItemIconCache } from "../src/game/systems/itemVisual";

const available = (...entries: string[]) => (texture: string, frame?: string) =>
  entries.includes(frame === undefined ? texture : `${texture}/${frame}`);

describe("allow-listed item art mapping", () => {
  it.each([...ITEMS.map(item => item.id), "gold"])("uses a complete atlas frame for %s", id => {
    expect(getItemVisual(id, available(`farm-icons-v1/${id}`))).toEqual({ texture: "farm-icons-v1", frame: id });
  });
  it.each(ITEMS)("preserves the correct existing fallback for $id", item => {
    const expected = item.id === "hoe" ? "icon_hoe" : item.id === "watering_can" ? "icon_watering_can"
      : item.category === ItemCategory.Seed ? `icon_seed_${item.id.replace(/_seed$/, "")}` : item.category === ItemCategory.Crop ? `icon_crop_${item.id}` : "icon_empty";
    // An unrelated atlas frame must not stand in for the requested item.
    expect(getItemVisual(item.id, available("farm-icons-v1/unrelated", expected))).toEqual({ texture: expected });
  });
  it("keeps gold fallback distinct and returns empty for missing or unknown items", () => {
    expect(getItemVisual("gold", available("icon_gold"))).toEqual({ texture: "icon_gold" });
    for (const id of [null, "", "unknown", "dew_radish_seed_seed", "__proto__", "toString"]) {
      expect(getItemVisual(id, () => true)).toEqual({ texture: "icon_empty" });
    }
    expect(getItemVisual("hoe", () => false)).toEqual({ texture: "icon_empty" });
    expect(getItemVisual("dew_radish_seed", available("icon_seed"))).toEqual({ texture: "icon_empty" });
  });
  it.each(["branch", "stone", "wild_mushroom", "mushroom_meal"])("uses original exploration art for %s", id => {
    expect(getItemVisual(id, available(`farm-forage-v1/${id}`))).toEqual({ texture: "farm-forage-v1", frame: id });
  });
});

describe("menu atlas URL cache", () => {
  function setup() {
    const sheets = new Map<string, Map<string, object>>();
    const put = (texture: string, frame = "__BASE") => {
      if (!sheets.has(texture)) sheets.set(texture, new Map());
      sheets.get(texture)!.set(frame, {});
    };
    const getBase64 = vi.fn((texture: string, frame?: string) => `data:image/png;${texture}/${frame ?? "base"}`);
    const scene = { textures: {
      exists: (texture: string) => sheets.has(texture),
      get: (texture: string) => ({ has: (frame: string) => sheets.get(texture)?.has(frame) ?? false }),
      getFrame: (texture: string, frame?: string) => sheets.get(texture)?.get(frame ?? "__BASE"),
      getBase64,
    } } as unknown as Phaser.Scene;
    return { put, getBase64, cache: new ItemIconCache(scene) };
  }
  it("requests each exact frame instead of exporting the entire atlas and caches it", () => {
    const { put, getBase64, cache } = setup();
    put("farm-icons-v1", "hoe"); put("farm-icons-v1", "watering_can");
    expect(cache.src("hoe")).toContain("farm-icons-v1/hoe");
    expect(cache.src("hoe")).toContain("farm-icons-v1/hoe");
    expect(cache.src("watering_can")).toContain("farm-icons-v1/watering_can");
    expect(getBase64.mock.calls).toEqual([["farm-icons-v1", "hoe"], ["farm-icons-v1", "watering_can"]]);
  });
  it("upgrades a cached fallback when its own atlas frame arrives later", () => {
    const { put, getBase64, cache } = setup();
    put("icon_seed_dew_radish"); put("farm-icons-v1", "hoe");
    expect(cache.src("dew_radish_seed")).toContain("icon_seed_dew_radish/base");
    put("farm-icons-v1", "dew_radish_seed");
    expect(cache.src("dew_radish_seed")).toContain("farm-icons-v1/dew_radish_seed");
    expect(getBase64).toHaveBeenCalledTimes(2);
    // Same key, reloaded texture frame: cached pixels must also be replaced.
    put("farm-icons-v1", "dew_radish_seed"); cache.src("dew_radish_seed");
    expect(getBase64).toHaveBeenCalledTimes(3);
  });
  it("renders empty/missing art transparently without reading the legacy gray icon", () => {
    const { put, getBase64, cache } = setup();
    put("icon_empty"); put("farm-icons-v1", "unknown");
    for (const id of [null, "unknown", "hoe"]) expect(cache.src(id)).toMatch(/^data:image\/gif;base64,/);
    expect(getBase64).not.toHaveBeenCalled();
    put("farm-icons-v1", "hoe"); expect(cache.src("hoe")).toContain("farm-icons-v1/hoe");
  });
  it("does not permanently cache a failed canvas export", () => {
    const { put, getBase64, cache } = setup(); put("farm-icons-v1", "hoe");
    getBase64.mockImplementationOnce(() => { throw new Error("canvas unavailable"); });
    expect(cache.src("hoe")).toMatch(/^data:image\/gif;base64,/);
    expect(cache.src("hoe")).toContain("farm-icons-v1/hoe");
  });
});
