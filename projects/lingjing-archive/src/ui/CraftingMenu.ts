import type Phaser from "phaser";
import { getGameSession } from "../game/systems/GameSession";
import { getItem } from "../data/items";
import { RECIPES } from "../data/exploration";
import { getFarmAudio } from "../game/systems/farmAudio";
import { ItemIconCache } from "../game/systems/itemVisual";
import { PausePanel, node, FEEDBACK } from "./PausePanel";

export class CraftingMenu extends PausePanel {
  private message = "";
  private readonly icons: ItemIconCache;
  constructor(scene: Phaser.Scene) { super(scene, "随身制作", "KeyK"); this.icons = new ItemIconCache(scene); }
  open(): void { if (this.begin()) { this.message = ""; this.render(); } }
  private render(): void {
    const s = getGameSession(), state = s.exploration.state, panel = this.panel("随身制作");
    panel.append(node("p", "farm-menu-note", "材料从随身背包取用。采集过的林间资源睡一觉后恢复。"));
    for (const recipe of Object.values(RECIPES)) {
      const row = node("div", "farm-market-row"), detail = node("div", "farm-market-detail");
      const icon = node("img", "farm-item-icon"); icon.alt = "";
      icon.src = recipe.id === "mushroom_meal" ? this.icons.src(recipe.id)
        : this.scene.textures.exists("farm-forage-v1") && this.scene.textures.get("farm-forage-v1").has("farm_lantern")
          ? this.scene.textures.getBase64("farm-forage-v1", "farm_lantern") : this.icons.src("branch");
      detail.append(node("strong", "", recipe.name), node("small", "", recipe.ingredients.map(i => `${getItem(i.itemId)?.name} ${s.inventory.count(i.itemId)}/${i.amount}`).join(" · ")));
      const built = recipe.id === "farm_lantern" && state.lanternBuilt;
      const locked = recipe.requiresCarpenter && state.carpenterQuest !== "completed";
      detail.append(node("small", "", recipe.id === "mushroom_meal" ? "吃一份恢复25体力" : locked ? "完成阿榆的修缮委托后学会" : "为农舍门前安一盏灯 · 永久保留"));
      row.append(icon, detail, this.button(built ? "已安好" : locked ? "未学会" : "制作", `craft-${recipe.id}`, () => {
        const result = s.craftItem(recipe.id); getFarmAudio().play(result.ok ? "confirm" : "error");
        this.message = result.ok ? recipe.id === "farm_lantern" ? "农舍门前的提灯已安好，夜晚会亮起。" : "制作了1份菌菇餐。" : FEEDBACK[result.reason] ?? "制作未完成。"; this.render();
      }, built || locked || recipe.ingredients.some(i => s.inventory.count(i.itemId) < i.amount)));
      panel.append(row);
    }
    panel.append(node("p", "farm-menu-note", `体力 ${s.life.energy}/100 · 随身菌菇餐 ${s.inventory.count("mushroom_meal")} 份`), this.button("吃一份菌菇餐", "eat-meal", () => {
      const result = s.eatMeal(); getFarmAudio().play(result.ok ? "confirm" : "error");
      this.message = result.ok ? "吃好了，体力恢复。" : FEEDBACK[result.reason] ?? "暂时吃不了。"; this.render();
    }, s.life.energy >= 100 || s.inventory.count("mushroom_meal") < 1));
    const status = node("p", "farm-menu-status", this.message || "K / Esc 关闭 · 制作和吃饭都不会推进时间"); status.setAttribute("role", "status"); panel.append(status); this.show(panel);
  }
}
