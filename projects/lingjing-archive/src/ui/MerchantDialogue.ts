import type Phaser from "phaser";
import { getCrop } from "../data/crops";
import { getGameSession } from "../game/systems/GameSession";
import { getIntroQuestCrop, INTRO_QUEST_REWARD, INTRO_QUEST_SEEDS } from "../domain/services/IntroQuestService";
import { getFarmAudio } from "../game/systems/farmAudio";

const ERRORS: Record<string, string> = {
  INVENTORY_FULL: "背包放不下种子了。腾出一个格子，再来找我。",
  NOT_ENOUGH: "请把需要交付的收成放在随身背包里，木箱里的不计入。",
  GOLD_LIMIT: "金币已达到上限，请先消费一些，再领取报酬。",
  SAVE_FAILED: "保存失败，这次领取或交付已撤回。请检查浏览器存储空间。",
  QUEST_ALREADY_ACCEPTED: "这包种子已经领过了，照料好它们吧。",
  QUEST_NOT_ACTIVE: "这份委托已经处理过了。",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, name = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = name; node.textContent = text; return node;
}

/** Conversation and journal share one modal; all rewards go through persisted session transactions. */
export class MerchantDialogue {
  private overlay: HTMLDivElement | null = null;
  private oldFocus: Element | null = null;
  private mode: "talk" | "journal" = "talk";
  private message = "";
  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.overlay) return;
    if (event.key === "Escape" || event.code === "KeyQ") { event.preventDefault(); this.close(); }
    else if (event.key === "Tab") {
      const buttons = Array.from(this.overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (buttons.length) {
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey ? (current - 1 + buttons.length) % buttons.length : (current + 1) % buttons.length;
        event.preventDefault(); buttons[next].focus();
      }
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
    event.stopPropagation();
  };

  constructor(private readonly scene: Phaser.Scene, private readonly openMarket: () => void,
    private readonly canMeet: () => boolean, private readonly byLetter: () => boolean) {
    document.addEventListener("keydown", this.onKey, true);
  }

  get isOpen(): boolean { return this.overlay !== null; }

  open(mode: "talk" | "journal"): void {
    if (this.overlay) return;
    this.mode = mode; this.message = ""; this.oldFocus = document.activeElement;
    this.overlay = el("div", "farm-menu-overlay merchant-overlay");
    this.overlay.setAttribute("role", "dialog"); this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-label", mode === "talk" ? "与禾木交谈" : "农场任务手记");
    document.getElementById("game-root")!.append(this.overlay);
    this.scene.physics.world.pause(); this.scene.input.enabled = false;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = false; }
    this.render();
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.remove(); this.overlay = null;
    this.scene.input.enabled = true;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = true; }
    this.scene.physics.world.resume();
    if (this.oldFocus instanceof HTMLElement && this.oldFocus.isConnected) this.oldFocus.focus();
  }

  destroy(): void { this.close(); document.removeEventListener("keydown", this.onKey, true); }

  private button(text: string, action: string, run: () => void): HTMLButtonElement {
    const button = el("button", "", text); button.type = "button"; button.dataset.action = action;
    button.addEventListener("click", run); return button;
  }

  private render(): void {
    if (!this.overlay) return;
    const oldAction = (document.activeElement as HTMLElement | null)?.dataset.action;
    const session = getGameSession(), state = session.introQuest.state;
    const crop = state.cropId ? getCrop(state.cropId)! : getIntroQuestCrop(session.time.date.season)!;
    const mayAct = this.canMeet() || this.byLetter();
    const count = session.inventory.count(crop.id);
    const panel = el("section", "farm-menu-panel merchant-panel");
    const header = el("header", "farm-menu-header");
    header.append(el("h2", "", this.mode === "journal" ? "林缘手记" : this.byLetter() ? "禾木的便笺" : "禾木 · 杂货商"),
      this.button("关闭 ×", "close", () => this.close()));
    const intro = el("div", "merchant-intro");
    const portrait = el("img", "merchant-portrait"); portrait.alt = "禾木，戴绿帽与赭红围巾的杂货商";
    portrait.src = `${import.meta.env.BASE_URL}farm-assets/original-addons/v5/merchant-v1.png`;
    if (this.scene.textures.exists("farm-residents-motion-v1") && this.scene.textures.get("farm-residents-motion-v1").has("merchant_idle")) {
      portrait.src = this.scene.textures.getBase64("farm-residents-motion-v1", "merchant_idle");
    }
    const speech = el("div", "merchant-speech");
    speech.append(el("small", "", this.mode === "journal" ? "初来林缘 · 禾木的委托" : "种子与日常，总会慢慢长好。"));
    const greeting = this.mode === "journal" ? "从一小块田开始，先试着种出自己的第一份收成。"
      : state.status === "completed" ? "你的第一份收成很不错！往后有需要，就来看看当季种子。"
      : state.status === "active" && count > 0 ? `这批${crop.name}长得不错！留一份给我尝尝，其余的收成你可以留存或出售。`
      : session.weather.current().autoWater ? "今天的雨替你浇了水。泥土还湿着，适合慢慢照料田地。"
      : session.life.isLate ? "夜深啦，别忙坏了。先回小屋睡一觉，收成的事明天再说。"
      : state.status === "active" ? "种子收好了吧？每天给田地浇水，再回小屋休息。慢慢来，我等你的第一份收成。"
      : "欢迎来到林缘。我是禾木，带了些种子。咱们从一份小小的收成开始吧。";
    speech.append(el("p", "", greeting)); intro.append(portrait, speech);
    const card = el("div", "merchant-quest");
    card.append(el("strong", "", state.status === "completed" ? "✓ 首份收成 · 已完成" : "首份收成"));
    if (state.status === "available") {
      card.append(el("p", "", `领 ${crop.name}种子 × ${INTRO_QUEST_SEEDS}，种植、浇水并在床边休息。收获后交给禾木 ${crop.name} × 1。`));
    } else if (state.status === "active") {
      card.append(el("p", "", `交付：${crop.name} × 1　随身背包 ${Math.min(count, 1)}/1`));
      card.append(el("small", "", `需 ${crop.growDays} 个生长日：每天浇水后休息，雨天自动浇水。成熟时靠近按 E 收获。任务无期限，目标不随换季改变。`));
    } else card.append(el("p", "", `已交付 ${crop.name} × 1，报酬 ${INTRO_QUEST_REWARD} 金已入账。多余收成可以留存或出售。`));
    if (state.status !== "completed") card.append(el("small", "merchant-reward", `完成报酬 ${INTRO_QUEST_REWARD} 金 · 种子仅可领取一次`));
    const actions = el("div", "merchant-actions");
    if (state.status === "available") {
      const canFit = session.inventory.hasSpace(crop.seedItemId, INTRO_QUEST_SEEDS);
      const accept = this.button("收下种子 · 接受委托", "accept", () => {
        const result = session.acceptIntroQuest();
        getFarmAudio().play(result.ok ? "confirm" : "error");
        this.message = result.ok ? `已收到 ${crop.name}种子 × ${INTRO_QUEST_SEEDS}。用锄头开垦，再选择种子播种。` : ERRORS[result.reason] ?? "委托未完成，请稍后再试。";
        this.render();
      });
      accept.disabled = !mayAct || !canFit; actions.append(accept);
      if (!canFit) this.message ||= "背包已满，请先腾出能容纳3颗种子的空间。";
    } else if (state.status === "active") {
      const deliver = this.button(`交付 1 份 · 领取 ${INTRO_QUEST_REWARD} 金`, "deliver", () => {
        const result = session.completeIntroQuest();
        getFarmAudio().play(result.ok ? "coin" : "error");
        this.message = result.ok ? `谢谢你的收成！${INTRO_QUEST_REWARD} 金已经收好。` : ERRORS[result.reason] ?? "委托未完成，请稍后再试。";
        this.render();
      });
      deliver.disabled = !mayAct || count < 1; actions.append(deliver);
    }
    if (this.mode === "talk" || this.byLetter()) actions.append(this.button("看看当季种子", "market", () => { this.close(); this.openMarket(); }));
    const status = el("p", "farm-menu-status merchant-status", this.message || (!mayAct
      ? "找到农田旁的禾木，靠近按 E 领取或交付。Q / Esc 合上手记。"
      : this.byLetter() ? "田边暂时没有空位，禾木改用便笺联络。Q / Esc 关闭。"
      : "交谈时农场暂停 · Esc 离开 · Tab 选择，Enter 确认"));
    status.setAttribute("role", "status");
    panel.append(header, intro, card, actions, status); this.overlay.replaceChildren(panel);
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    (buttons.find(button => button.dataset.action === oldAction) ?? buttons.find(button => button.dataset.action !== "close") ?? buttons[0])?.focus();
  }
}
