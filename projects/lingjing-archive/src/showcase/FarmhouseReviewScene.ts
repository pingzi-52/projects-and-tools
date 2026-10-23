import Phaser from "phaser";
import { CainosScene } from "./CainosScene";

/** Composition review only. No home interaction or changes to the playable map. */
export class FarmhouseReviewScene extends CainosScene {
  constructor() { super(true); }

  override preload(): void {
    super.preload();
    this.load.image("farmhouse-candidate", `${import.meta.env.BASE_URL}farm-assets/original-addons/v2/farmhouse-v1.png`);
  }

  override create(): void {
    super.create();
    if (!this.textures.exists("farmhouse-candidate")) return;
    for (const object of [...this.children.list]) {
      if (!(object instanceof Phaser.GameObjects.Image)) continue;
      const tree = object.texture.key === "TX Plant" && String(object.frame.name).startsWith("tree-");
      const shadow = object.texture.key === "TX Shadow Plant" && String(object.frame.name).includes("Tree");
      if ((tree || shadow) && object.x < 240 && object.y < 180) object.destroy();
    }
    this.add.image(124, 180, "farmhouse-candidate").setOrigin(0.5, 1).setDisplaySize(160, 180).setDepth(180);
    document.title = "灵镜档案 · 农舍素材与比例验证";
    const heading = document.querySelector("h1");
    if (heading) heading.textContent = "灵镜档案 · 农舍构图";
    const status = document.getElementById("sample-status");
    if (status) status.textContent = "农舍候选 · 原创生成素材 · 仅构图与比例验证，尚未接入室内";
  }
}
