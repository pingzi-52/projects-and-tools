import type Phaser from "phaser";
import { getFarmAudio } from "../game/systems/farmAudio";
import "../styles/audio-settings.css";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
}

type AudioPatch = { muted?: boolean; sfxVolume?: number; ambienceVolume?: number };

/** Settings have their own storage key; this panel never changes game/session state. */
export class AudioSettingsMenu {
  private overlay: HTMLDivElement | null = null;
  private oldFocus: Element | null = null;
  private status: HTMLParagraphElement | null = null;
  private muted: HTMLInputElement | null = null;
  private sfx: HTMLInputElement | null = null;
  private ambience: HTMLInputElement | null = null;
  private sfxValue: HTMLOutputElement | null = null;
  private ambienceValue: HTMLOutputElement | null = null;
  private saveFailed = false;
  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.overlay) return;
    if (event.key === "Escape" || event.code === "KeyM") {
      event.preventDefault(); this.close();
    } else if (event.key === "Tab") {
      const controls = Array.from(this.overlay.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input:not(:disabled),button:not(:disabled)"));
      if (controls.length) {
        const current = controls.indexOf(document.activeElement as HTMLInputElement | HTMLButtonElement);
        const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
          : (current + (event.shiftKey ? controls.length - 1 : 1)) % controls.length;
        event.preventDefault(); controls[next].focus();
      }
    }
    // Preserve native checkbox/range/button defaults, including slider arrow keys.
    event.stopPropagation();
  };

  constructor(private readonly scene: Phaser.Scene) {
    document.addEventListener("keydown", this.onKey, true);
  }

  get isOpen(): boolean { return this.overlay !== null; }

  open(): void {
    if (this.overlay) return;
    const root = document.getElementById("game-root");
    if (!root || root.querySelector(".farm-menu-overlay")) return;
    this.oldFocus = document.activeElement; this.saveFailed = false;
    this.overlay = el("div", "farm-menu-overlay audio-settings-overlay");
    this.overlay.setAttribute("role", "dialog"); this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-label", "音频设置");
    const panel = el("section", "farm-menu-panel audio-settings-panel");
    const header = el("header", "farm-menu-header");
    header.append(el("h2", "", "音频设置"), this.button("关闭 ×", "audio-close", () => this.close()));
    const note = el("p", "audio-settings-note", "操作声与风雨声 · 没有背景音乐");
    const muteLabel = el("label", "audio-settings-mute");
    this.muted = el("input"); this.muted.type = "checkbox"; this.muted.id = "farm-audio-muted";
    this.muted.dataset.setting = "muted"; muteLabel.htmlFor = this.muted.id;
    muteLabel.append(this.muted, document.createTextNode("静音所有声音"));
    this.muted.addEventListener("change", () => this.persist({ muted: this.muted!.checked }));
    const effects = this.volumeRow("操作音量", "sfx", "sfxVolume");
    this.sfx = effects.input; this.sfxValue = effects.output;
    const weather = this.volumeRow("风雨音量", "ambience", "ambienceVolume");
    this.ambience = weather.input; this.ambienceValue = weather.output;
    const actions = el("div", "audio-settings-actions");
    actions.append(this.button("试听操作声", "audio-test", () => {
      getFarmAudio().play("confirm");
      if (!this.saveFailed && this.status) this.status.textContent = getFarmAudio().settings.muted
        ? "静音已开启，关闭静音后可试听。" : "已试听操作声 · M / Esc 关闭";
    }), this.button("恢复默认", "audio-reset", () => {
      this.persist({ muted: false, sfxVolume: 0.5, ambienceVolume: 0.16 }); this.syncControls();
    }));
    this.status = el("p", "farm-menu-status audio-settings-status", "设置自动保存 · M / Esc 关闭");
    this.status.setAttribute("role", "status"); this.status.setAttribute("aria-live", "polite");
    panel.append(header, note, muteLabel, effects.row, weather.row, actions, this.status);
    this.overlay.append(panel); root.append(this.overlay);
    this.syncControls();
    this.scene.physics.world.pause(); this.scene.input.enabled = false;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = false; }
    getFarmAudio().setPaused(true);
    this.muted.focus();
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.remove(); this.overlay = null;
    this.status = this.muted = this.sfx = this.ambience = this.sfxValue = this.ambienceValue = null;
    this.scene.input.enabled = true;
    if (this.scene.input.keyboard) { this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = true; }
    this.scene.physics.world.resume();
    if (this.oldFocus instanceof HTMLElement && this.oldFocus.isConnected) this.oldFocus.focus();
    this.oldFocus = null;
    // The active scene decides whether ambience can resume (menus/title/hidden).
  }

  destroy(): void { this.close(); document.removeEventListener("keydown", this.onKey, true); }

  private button(text: string, action: string, run: () => void): HTMLButtonElement {
    const button = el("button", "", text); button.type = "button"; button.dataset.action = action;
    button.addEventListener("click", run); return button;
  }

  private volumeRow(text: string, setting: "sfx" | "ambience", key: "sfxVolume" | "ambienceVolume") {
    const row = el("div", "audio-settings-volume");
    const label = el("label", "", text), input = el("input"), output = el("output");
    input.type = "range"; input.min = "0"; input.max = "100"; input.step = "1";
    input.id = `farm-audio-${setting}`; input.dataset.setting = setting;
    label.htmlFor = input.id; output.setAttribute("for", input.id);
    input.addEventListener("input", () => {
      output.value = `${input.value}%`;
      this.persist({ [key]: Number(input.value) / 100 });
    });
    row.append(label, output, input); return { row, input, output };
  }

  private syncControls(): void {
    const settings = getFarmAudio().settings;
    if (this.muted) this.muted.checked = settings.muted;
    if (this.sfx && this.sfxValue) {
      this.sfx.value = String(Math.round(settings.sfxVolume * 100)); this.sfxValue.value = `${this.sfx.value}%`;
    }
    if (this.ambience && this.ambienceValue) {
      this.ambience.value = String(Math.round(settings.ambienceVolume * 100)); this.ambienceValue.value = `${this.ambience.value}%`;
    }
  }

  private persist(patch: AudioPatch): void {
    this.saveFailed = !getFarmAudio().updateSettings(patch);
    if (this.status) this.status.textContent = this.saveFailed
      ? "当前会话生效，刷新后可能丢失" : "设置已保存 · M / Esc 关闭";
  }
}
