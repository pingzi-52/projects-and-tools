import Phaser from "phaser";
import { SCENE_TITLE } from "../config";
import { ensurePlaceholderTextures } from "../systems/placeholderAssets";
import { preloadFarmArt } from "../systems/farmArtAssets";

/** Load display art first; generated textures remain available as a fallback. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    preloadFarmArt(this);
  }

  create(): void {
    ensurePlaceholderTextures(this);
    this.scene.start(SCENE_TITLE);
  }
}
