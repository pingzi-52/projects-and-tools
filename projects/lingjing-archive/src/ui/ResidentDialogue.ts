import type Phaser from "phaser";
import { getGameSession } from "../game/systems/GameSession";
import { EXPLORATION_QUESTS, type ExplorationQuestKind } from "../data/exploration";
import { getItem } from "../data/items";
import { getFarmAudio } from "../game/systems/farmAudio";
import { PausePanel, node, FEEDBACK } from "./PausePanel";

export class ResidentDialogue extends PausePanel {
  private message = "";
  constructor(scene: Phaser.Scene, private readonly kind: ExplorationQuestKind, private readonly openCraft: () => void) { super(scene, "林缘居民对话", ""); }
  open(): void { if (this.begin()) { this.message = ""; this.render(); } }
  private render(): void {
    const s = getGameSession(), state = s.exploration.state, quest = EXPLORATION_QUESTS[this.kind];
    const status = this.kind === "forest" ? state.forestQuest : state.carpenterQuest;
    const panel = this.panel(this.kind === "forest" ? "岚 · 林缘向导" : "阿榆 · 木匠");
    const intro = node("div", "merchant-intro"), portrait = node("img", "merchant-portrait"); portrait.alt = "";
    const frame = this.kind === "forest" ? "guide" : "carpenter";
    if (this.scene.textures.exists("farm-residents-motion-v1") && this.scene.textures.get("farm-residents-motion-v1").has(`${frame}_idle`)) {
      portrait.src = this.scene.textures.getBase64("farm-residents-motion-v1", `${frame}_idle`);
    } else if (this.scene.textures.exists("farm-beta-npcs") && this.scene.textures.get("farm-beta-npcs").has(frame)) {
      portrait.src = this.scene.textures.getBase64("farm-beta-npcs", frame);
    }
    intro.append(portrait, node("p", "farm-menu-note", this.kind === "forest"
      ? "林子每天都会带来一点新东西。收集地上的枯枝、溪石和蘑菇，别忘了留些体力走回家。"
      : "工坊还有不少地方要修。带些材料来帮忙，我就把农场提灯的做法教给你。菌菇餐可以随手制作。"));
    panel.append(intro, node("strong", "", `${status === "completed" ? "✓ " : ""}${quest.name}`));
    for (const ingredient of quest.requirements) panel.append(node("p", "farm-menu-note", `${getItem(ingredient.itemId)?.name}：随身 ${s.inventory.count(ingredient.itemId)} / 交付 ${ingredient.amount}`));
    panel.append(node("p", "farm-menu-note", `报酬 ${quest.reward} 金${this.kind === "carpenter" ? "，并学会农场提灯配方" : ""} · 仅可完成一次`));
    if (status === "available") panel.append(this.button("接受委托", "resident-accept", () => {
      const result = s.acceptExplorationQuest(this.kind); getFarmAudio().play(result.ok ? "confirm" : "error");
      this.message = result.ok ? "委托已记下。背包里的材料够了，再回来找我。" : FEEDBACK[result.reason] ?? "接取未完成。"; this.render();
    }));
    else if (status === "active") panel.append(this.button("交付材料 · 领取报酬", "resident-deliver", () => {
      const result = s.completeExplorationQuest(this.kind); getFarmAudio().play(result.ok ? "coin" : "error");
      this.message = result.ok ? "谢谢你的帮忙！报酬已经收好。" : FEEDBACK[result.reason] ?? "交付未完成。"; this.render();
    }, quest.requirements.some(i => s.inventory.count(i.itemId) < i.amount)));
    if (this.kind === "carpenter") panel.append(this.button("看看制作配方", "resident-craft", () => { this.close(); this.openCraft(); }));
    const feedback = node("p", "farm-menu-status", this.message || (status === "completed" ? "委托已完成，报酬不会重复领取。" : "Esc 离开 · 只有随身背包中的材料可以交付"));
    feedback.setAttribute("role", "status"); panel.append(feedback); this.show(panel);
  }
}
