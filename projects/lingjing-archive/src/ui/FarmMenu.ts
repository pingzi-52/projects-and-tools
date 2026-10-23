import type Phaser from "phaser";
import { ItemCategory, type ItemDefinition } from "../domain/models/Item";
import { getItem } from "../data/items";
import { getCropBySeed } from "../data/crops";
import { getGameSession } from "../game/systems/GameSession";
import { ItemIconCache } from "../game/systems/itemVisual";
import { getFarmAudio } from "../game/systems/farmAudio";

type Tab = "market" | "inventory";
const SEASONS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const ERRORS: Record<string, string> = {
  GOLD_SHORT: "金币不足", INVENTORY_FULL: "背包已满", NOT_ENOUGH: "物品数量不足",
  INVALID_AMOUNT: "数量不正确", NOT_SELLABLE: "只有农产品和可出售的采集物可以出售",
  NOT_AVAILABLE: "这件商品当前没有上架", OUT_OF_SEASON: "种子当前没有上架",
  SAVE_FAILED: "保存失败，交易已撤回，请检查浏览器存储空间", UNKNOWN_ITEM: "找不到该物品",
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
}

/** DOM menus pause gameplay and call the same session services as the farm. */
export class FarmMenu {
  private overlay: HTMLDivElement | null = null;
  private tab: Tab = "market";
  private message = "";
  private pendingSlot: number | null = null;
  private oldFocus: Element | null = null;
  private readonly icons: ItemIconCache;
  private readonly onKey = (event: KeyboardEvent) => {
    if (!this.overlay) return;
    if (event.key === "Escape") { event.preventDefault(); this.close(); }
    else if (event.code === "KeyB" || event.code === "KeyI") {
      event.preventDefault(); this.tab = event.code === "KeyB" ? "market" : "inventory"; this.render();
    } else if (event.key === "Tab") {
      const buttons = Array.from(this.overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (buttons.length) {
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey ? (index - 1 + buttons.length) % buttons.length : (index + 1) % buttons.length;
        event.preventDefault(); buttons[next].focus();
      }
    }
    event.stopPropagation();
  };

  constructor(private readonly scene: Phaser.Scene, private readonly selectSlot: (index: number) => void) {
    this.icons = new ItemIconCache(scene);
    document.addEventListener("keydown", this.onKey, true);
  }

  get isOpen(): boolean { return this.overlay !== null; }

  open(tab: Tab): void {
    if (this.overlay) { this.tab = tab; this.render(); return; }
    this.tab = tab;
    this.message = "";
    this.pendingSlot = null;
    this.oldFocus = document.activeElement;
    this.overlay = element("div", "farm-menu-overlay");
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-label", "农场背包与集市");
    document.getElementById("game-root")!.append(this.overlay);
    this.scene.physics.world.pause();
    this.scene.input.enabled = false;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = false; }
    this.render();
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
    this.scene.input.enabled = true;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = true; }
    this.scene.physics.world.resume();
    if (this.oldFocus instanceof HTMLElement) this.oldFocus.focus();
  }

  destroy(): void {
    this.close();
    document.removeEventListener("keydown", this.onKey, true);
  }

  private button(label: string, action: () => void, className = ""): HTMLButtonElement {
    const button = element("button", className, label);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }

  private icon(item: ItemDefinition): HTMLImageElement {
    const image = element("img", "farm-item-icon");
    image.alt = "";
    image.src = this.icons.src(item.id);
    return image;
  }

  private render(): void {
    if (!this.overlay) return;
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset.focus;
    const session = getGameSession();
    const panel = element("section", "farm-menu-panel");
    const header = element("header", "farm-menu-header");
    header.append(element("h2", "", this.tab === "market" ? "枫木集市" : "农场背包"));
    header.append(this.button("关闭 ×", () => this.close(), "farm-menu-close"));
    const balance = element("p", "farm-menu-balance",
      `${SEASONS[session.time.date.season]} · 第 ${session.time.date.day} 天　　金币 ${session.economy.goldValue}`);
    const tabs = element("nav", "farm-menu-tabs");
    tabs.setAttribute("aria-label", "切换集市与背包");
    for (const [tab, label] of [["market", "当季种子 / B"], ["inventory", "背包与出售 / I"]] as const) {
      const button = this.button(label, () => { this.tab = tab; this.pendingSlot = null; this.message = ""; this.render(); });
      button.setAttribute("aria-pressed", String(this.tab === tab)); tabs.append(button);
    }
    panel.append(header, balance, tabs);
    const body = element("div", "farm-menu-body");
    if (this.tab === "market") this.market(body); else this.inventory(body);
    const status = element("p", "farm-menu-status", this.message || "菜单打开时农场暂停 · Esc 返回");
    status.setAttribute("role", "status");
    panel.append(body, status);
    this.overlay.replaceChildren(panel);
    const sameButton = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find(b => b.dataset.focus === focusKey);
    (sameButton ?? panel.querySelector<HTMLButtonElement>("button"))?.focus();
  }

  private market(body: HTMLDivElement): void {
    const session = getGameSession();
    body.append(element("p", "farm-menu-note", "每天浇水，睡觉后生长。收获的农产品可在背包中出售。"));
    for (const listing of session.shop.list(session.economy.goldValue, session.time.date.season)) {
      if (listing.item.category !== ItemCategory.Seed) continue;
      const row = element("div", "farm-market-row");
      const crop = getCropBySeed(listing.item.id);
      const detail = element("div", "farm-market-detail");
      detail.append(element("strong", "", listing.item.name), element("small", "",
        `${listing.price} 金币 / 颗　·　${crop?.growDays ?? "?"} 天成熟`));
      row.append(this.icon(listing.item), detail);
      for (const quantity of [1, 5]) {
        const button = this.button(`买 ${quantity}`, () => {
          const result = session.buyItem(listing.item.id, quantity);
          getFarmAudio().play(result.ok ? "coin" : "error");
          this.message = result.ok ? `买到 ${listing.item.name} × ${quantity}` : ERRORS[result.reason] ?? "交易未完成";
          this.render();
        });
        button.disabled = session.economy.goldValue < listing.price * quantity
          || !session.inventory.hasSpace(listing.item.id, quantity);
        button.dataset.focus = `buy-${listing.item.id}-${quantity}`;
        button.setAttribute("aria-label", `购买${listing.item.name}${quantity}颗`);
        row.append(button);
      }
      body.append(row);
    }
  }

  private inventory(body: HTMLDivElement): void {
    const session = getGameSession();
    const state = session.inventory.serialize();
    body.append(element("p", "farm-menu-note", "前 8 格是快捷栏。点选后方物品，再点前 8 格可交换位置。"));
    const grid = element("div", "farm-inventory-grid");
    state.slots.forEach((slot, index) => {
      const item = slot ? getItem(slot.itemId) : undefined;
      const button = this.button("", () => {
        if (this.pendingSlot !== null && index < 8) {
          const result = session.moveInventorySlot(this.pendingSlot, index);
          getFarmAudio().play(result.ok ? "confirm" : "error");
          this.message = result.ok ? "物品已移到快捷栏" : ERRORS[result.reason] ?? "移动未完成";
          this.pendingSlot = null; this.render();
        } else if (index < 8) { this.selectSlot(index); this.close(); }
        else if (slot) { this.pendingSlot = index; this.message = `已选择 ${item?.name ?? "物品"}，请点击一个快捷栏格`; this.render(); }
      }, "farm-inventory-slot");
      button.setAttribute("aria-label", `${index + 1}号格，${item ? `${item.name} ${slot!.amount}个` : "空"}`);
      button.setAttribute("aria-pressed", String(this.pendingSlot === index));
      if (index < 8) button.append(element("span", "farm-slot-number", String(index + 1)));
      if (item) button.append(this.icon(item), element("span", "farm-slot-count", String(slot!.amount)));
      grid.append(button);
    });
    body.append(grid);
    const sellable = new Set(state.slots.filter(slot => {
      const item = slot && getItem(slot.itemId);
      return item && [ItemCategory.Crop, ItemCategory.Material].includes(item.category) && item.sellPrice !== undefined;
    }).map(slot => slot!.itemId));
    if (!sellable.size) body.append(element("p", "farm-menu-note", "还没有可出售物品。收获农产品，或前往森林采集。"));
    for (const id of sellable) {
      const item = getItem(id)!;
      const quantity = session.inventory.count(id);
      const row = element("div", "farm-sell-row");
      row.append(element("span", "", `${item.name} × ${quantity}`), this.button(`全部出售 +${quantity * (item.sellPrice ?? 0)}`, () => {
        const result = session.sellItem(id, quantity);
        getFarmAudio().play(result.ok ? "coin" : "error");
        this.message = result.ok ? `卖出 ${item.name} × ${quantity}` : ERRORS[result.reason] ?? "出售未完成";
        this.render();
      }));
      body.append(row);
    }
  }
}
