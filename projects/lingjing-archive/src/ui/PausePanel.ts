import type Phaser from "phaser";
import { getFarmAudio } from "../game/systems/farmAudio";

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag); result.className = className; result.textContent = text; return result;
}
export const FEEDBACK: Record<string, string> = {
  SAVE_FAILED: "保存失败，本次操作已撤回，请检查浏览器存储空间。", INVENTORY_FULL: "背包已满，请先存放物品。",
  NOT_ENOUGH: "材料不足，木箱内的物品需要先取到背包。", GOLD_LIMIT: "金币已达上限，请先消费一些。",
  QUEST_ALREADY_ACCEPTED: "委托已经领取过了。", QUEST_NOT_ACTIVE: "这条委托当前不可交付。",
  RECIPE_LOCKED: "先替阿榆完成修缮材料委托，学习提灯配方。", ALREADY_BUILT: "农场提灯已经安好了。",
  ENERGY_FULL: "体力已满，先把食物留着吧。",
};

/** Shared pause/focus contract for beta travel, workshop and resident dialogs. */
export class PausePanel {
  protected overlay: HTMLDivElement | null = null;
  private oldFocus: Element | null = null;
  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.overlay) return;
    if (event.key === "Escape" || event.code === this.toggle) { event.preventDefault(); this.close(); }
    else if (event.key === "Tab") {
      const controls = Array.from(this.overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (controls.length) {
        const current = controls.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey ? (current - 1 + controls.length) % controls.length : (current + 1) % controls.length;
        event.preventDefault(); controls[next].focus();
      }
    }
    event.stopPropagation();
  };
  constructor(protected readonly scene: Phaser.Scene, private readonly label: string, private readonly toggle: string) {
    document.addEventListener("keydown", this.onKey, true);
  }
  get isOpen(): boolean { return this.overlay !== null; }
  protected begin(): boolean {
    const root = document.getElementById("game-root");
    if (this.overlay || !root || root.querySelector(".farm-menu-overlay")) return false;
    this.oldFocus = document.activeElement; this.overlay = node("div", "farm-menu-overlay beta-overlay");
    this.overlay.setAttribute("role", "dialog"); this.overlay.setAttribute("aria-modal", "true"); this.overlay.setAttribute("aria-label", this.label);
    root.append(this.overlay); this.scene.physics.world.pause(); this.scene.input.enabled = false;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = false; }
    getFarmAudio().setPaused(true); return true;
  }
  close(): void {
    if (!this.overlay) return;
    this.overlay.remove(); this.overlay = null; this.scene.input.enabled = true;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = true; }
    this.scene.physics.world.resume();
    if (this.oldFocus instanceof HTMLElement && this.oldFocus.isConnected) this.oldFocus.focus(); this.oldFocus = null;
  }
  destroy(): void { this.close(); document.removeEventListener("keydown", this.onKey, true); }
  protected button(label: string, action: string, run: () => void, disabled = false): HTMLButtonElement {
    const result = node("button", "", label); result.type = "button"; result.dataset.action = action; result.disabled = disabled;
    result.addEventListener("click", run); return result;
  }
  protected panel(title: string): HTMLElement {
    const panel = node("section", "farm-menu-panel"); panel.style.overflowY = "auto";
    const header = node("header", "farm-menu-header"); header.append(node("h2", "", title), this.button("关闭 ×", "beta-close", () => this.close()));
    panel.append(header); return panel;
  }
  protected show(panel: HTMLElement): void {
    if (!this.overlay) return;
    const action = (document.activeElement as HTMLElement | null)?.dataset.action;
    this.overlay.replaceChildren(panel);
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    (buttons.find(b => b.dataset.action === action) ?? buttons[0])?.focus();
  }
}
