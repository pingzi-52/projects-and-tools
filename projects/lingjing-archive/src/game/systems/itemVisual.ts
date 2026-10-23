import type Phaser from "phaser";
import { ITEMS } from "../../data/items";
import { ItemCategory } from "../../domain/models/Item";

export interface ItemVisual { texture: string; frame?: string }
export type HasItemFrame = (texture: string, frame?: string) => boolean;
const ATLAS = "farm-icons-v1";
const ITEMS_BY_ID = new Map(ITEMS.map(item => [item.id, item]));
// A transparent DOM image for empty/missing art; do not expose the legacy gray empty tile.
const TRANSPARENT_ICON = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** One allow-listed mapping for Phaser images and menu icons. Gold is a HUD-only item. */
export function getItemVisual(itemId: string | null, hasFrame: HasItemFrame): ItemVisual {
  if (itemId === null) return { texture: "icon_empty" };
  const item = ITEMS_BY_ID.get(itemId);
  if (!item && itemId !== "gold") return { texture: "icon_empty" };
  if (["branch", "stone", "wild_mushroom", "mushroom_meal"].includes(itemId) && hasFrame("farm-forage-v1", itemId)) return { texture: "farm-forage-v1", frame: itemId };
  if (["silver_crucian", "sun_carp"].includes(itemId) && hasFrame("farm-fish-v1", itemId)) return { texture: "farm-fish-v1", frame: itemId };
  if (hasFrame(ATLAS, itemId)) return { texture: ATLAS, frame: itemId };
  let texture = "icon_empty";
  if (itemId === "gold") texture = "icon_gold";
  else if (itemId === "hoe") texture = "icon_hoe";
  else if (itemId === "watering_can") texture = "icon_watering_can";
  else if (item?.category === ItemCategory.Seed) texture = `icon_seed_${itemId.replace(/_seed$/, "")}`;
  else if (item?.category === ItemCategory.Crop) texture = `icon_crop_${itemId}`;
  return { texture: hasFrame(texture) ? texture : "icon_empty" };
}

/** Re-resolve every lookup so a later loaded atlas supersedes its cached fallback. */
export class ItemIconCache {
  private readonly cache = new Map<string, { frame: Phaser.Textures.Frame; url: string }>();
  constructor(private readonly scene: Phaser.Scene) {}

  src(itemId: string | null): string {
    const textures = this.scene.textures;
    const visual = getItemVisual(itemId, (texture, frame) => textures.exists(texture)
      && (frame === undefined || textures.get(texture).has(frame)));
    if (visual.texture === "icon_empty") return TRANSPARENT_ICON;
    const frame = textures.getFrame(visual.texture, visual.frame);
    if (!frame) return TRANSPARENT_ICON;
    const key = JSON.stringify([visual.texture, visual.frame ?? null]);
    const cached = this.cache.get(key);
    if (cached?.frame === frame) return cached.url;
    try {
      const url = textures.getBase64(visual.texture, visual.frame);
      if (!url) return TRANSPARENT_ICON;
      this.cache.set(key, { frame, url });
      return url;
    } catch { return TRANSPARENT_ICON; }
  }
}
