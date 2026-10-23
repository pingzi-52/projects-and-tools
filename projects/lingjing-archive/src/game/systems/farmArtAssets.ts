import type Phaser from "phaser";

/** Display-only originals. Missing files leave the existing placeholder path available. */
export function preloadFarmArt(scene: Phaser.Scene): void {
  for (const [key, file] of [["farm-residents-motion-v1", "residents-motion-v1"], ["farm-town-buildings-v1", "town-buildings-v1"]]) {
    if (!scene.textures.exists(key)) {
      const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v8/${file}`;
      scene.load.atlas(key, `${base}.png`, `${base}.json`);
    }
  }
  for (const [key, file] of [["farm-forage-v1", "forage-v1"], ["farm-beta-npcs", "residents-v1"]]) {
    if (!scene.textures.exists(key)) {
      const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v7/${file}`;
      scene.load.atlas(key, `${base}.png`, `${base}.json`);
    }
  }
  if (!scene.textures.exists("farm-icons-v1")) {
    const icons = `${import.meta.env.BASE_URL}farm-assets/original-addons/v6/item-icons-v1`;
    scene.load.atlas("farm-icons-v1", `${icons}.png`, `${icons}.json`);
  }
  const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v3/`;
  const sheets = [
    ["farm-farmer-v1", "farmer-v1"],
    ["farm-spring-crops-v1", "spring-crops-v1"],
    ["farm-soil-v1", "soil-v1"],
  ];
  for (const [key, file] of sheets) {
    if (!scene.textures.exists(key)) scene.load.atlas(key, `${base}${file}.png`, `${base}${file}.json`);
  }
  if (!scene.textures.exists("farm-soil-patch-v2")) {
    const soil = `${import.meta.env.BASE_URL}farm-assets/original-addons/v4/soil-patches-v2`;
    scene.load.atlas("farm-soil-patch-v2", `${soil}.png`, `${import.meta.env.BASE_URL}farm-assets/original-addons/v4/soil-patches-v3.json`);
  }
}
