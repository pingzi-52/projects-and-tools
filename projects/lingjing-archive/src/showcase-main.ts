import Phaser from "phaser";
import { VIEW } from "./game/config";
import { ShowcaseScene } from "./showcase/ShowcaseScene";
import { CainosScene } from "./showcase/CainosScene";
import { FarmhouseReviewScene } from "./showcase/FarmhouseReviewScene";

// Both previews remain independent of the main game's session and save manager.
const style = new URLSearchParams(window.location.search).get("style");
const cainos = style === "cainos" || style === "cainos-farm";
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: VIEW.width,
  height: VIEW.height,
  pixelArt: true,
  scene: [style === "cainos-home" ? new FarmhouseReviewScene()
    : cainos ? new CainosScene(style === "cainos-farm") : ShowcaseScene],
});
