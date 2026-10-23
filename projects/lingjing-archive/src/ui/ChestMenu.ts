import type Phaser from "phaser";
import type { ItemDefinition } from "../domain/models/Item";
import { getItem } from "../data/items";
import { getGameSession } from "../game/systems/GameSession";
import type { InventoryService } from "../domain/services/InventoryService";
import { ItemIconCache } from "../game/systems/itemVisual";
import { getFarmAudio } from "../game/systems/farmAudio";

const create = (tag: string, className = "", text = "") => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const ERROR: Record<string, string> = {
  NOT_ENOUGH: "物品数量不足", INVENTORY_FULL: "目标容器已满",
  SAVE_FAILED: "保存失败，物品已还原。请检查浏览器存储空间。",
};

export class ChestMenu {
  private overlay: HTMLElement | null = null;
  private message = "";
  private previousFocus: Element | null = null;
  private readonly icons: ItemIconCache;
  private readonly key = (event: KeyboardEvent) => {
    if (!this.overlay) return;
    if (event.key === "Escape") { event.preventDefault(); this.close(); }
    if (event.key === "Tab") {
      const buttons = Array.from(this.overlay?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      if (buttons.length) {
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      }
    }
    event.stopPropagation();
  };

  constructor(private readonly scene: Phaser.Scene) {
    this.icons = new ItemIconCache(scene);
    document.addEventListener("keydown", this.key, true);
  }
  get isOpen(): boolean { return this.overlay !== null; }
  open(): void {
    if (this.overlay) return;
    this.message = "";
    this.previousFocus = document.activeElement;
    this.overlay = create("div", "farm-menu-overlay");
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-label", "农舍储物箱");
    document.getElementById("game-root")!.append(this.overlay);
    this.scene.physics.world.pause();
    this.scene.input.enabled = false;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = false; }
    this.render();
  }
  close(): void {
    if (!this.overlay) return;
    this.overlay.remove(); this.overlay = null;
    this.scene.input.enabled = true;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = true; }
    this.scene.physics.world.resume();
    if (this.previousFocus instanceof HTMLElement) this.previousFocus.focus();
  }
  destroy(): void { this.close(); document.removeEventListener("keydown", this.key, true); }

  private button(text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
    button.addEventListener("click", action); return button;
  }
  private icon(item: ItemDefinition): HTMLImageElement {
    const image = document.createElement("img"); image.className = "farm-item-icon"; image.alt = ""; image.src = this.icons.src(item.id);
    return image;
  }
  private render(): void {
    if (!this.overlay) return;
    const session = getGameSession();
    const panel = create("section", "farm-menu-panel");
    const header = create("header", "farm-menu-header");
    header.append(create("h2", "", "农舍储物箱"), this.button("关闭 ×", () => this.close()));
    const columns = create("div", "farm-chest-columns farm-menu-body");
    columns.append(this.column("背包", session.inventory, "deposit"), this.column("储物箱", session.chest, "withdraw"));
    const status = create("p", "farm-menu-status", this.message || "存取自动保存 · 工具也可存放 · Esc 返回");
    status.setAttribute("role", "status");
    panel.append(header, create("p", "farm-menu-note", "每边 24 格。存入 1 件或全部；取出后可在背包整理快捷栏。"), columns, status);
    this.overlay.replaceChildren(panel);
    panel.querySelector<HTMLButtonElement>("button")?.focus();
  }
  private column(title: string, inventory: InventoryService, direction: "deposit" | "withdraw"): HTMLElement {
    const column = create("section", "farm-chest-column");
    const slots = inventory.serialize().slots;
    column.append(create("h3", "", `${title}　${slots.filter(Boolean).length} / 24`));
    const ids = new Set(slots.filter(Boolean).map(slot => slot!.itemId));
    if (!ids.size) column.append(create("p", "farm-menu-note", "这里还没有物品"));
    for (const id of ids) {
      const item = getItem(id)!; const amount = inventory.count(id);
      const row = create("div", "farm-chest-row");
      const label = create("div", "farm-chest-item");
      label.append(this.icon(item), create("span", "", `${item.name} × ${amount}`));
      const controls = create("div", "farm-chest-actions");
      for (const [quantity, label] of [[1, direction === "deposit" ? "存 1" : "取 1"], [amount, direction === "deposit" ? "全存" : "全取"]] as const) {
        const button = this.button(label, () => {
          const result = getGameSession().transferChest(id, quantity, direction);
          getFarmAudio().play(result.ok ? "confirm" : "error");
          this.message = result.ok ? `${direction === "deposit" ? "存入" : "取出"} ${item.name} × ${quantity}` : ERROR[result.reason] ?? "存取未完成";
          this.render();
        });
        button.dataset.action = `${direction}-${id}-${label.endsWith("1") ? "one" : "all"}`;
        button.setAttribute("aria-label", `${label} ${item.name}`);
        controls.append(button);
      }
      row.append(label, controls); column.append(row);
    }
    return column;
  }
}
