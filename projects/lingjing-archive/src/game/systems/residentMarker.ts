import type Phaser from "phaser";
import type { GuidanceStatus } from "../../ui/questGuidance";

/** Reused world-space text, with no tween, timer, body or persistent state. */
export class ResidentMarker {
  private readonly badge: Phaser.GameObjects.Text;
  private last = "";

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.badge = scene.add.text(x, y, "", {
      fontFamily: "monospace", fontSize: "12px", color: "#fff1b7",
      backgroundColor: "#49351fec", padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setDepth(20).setVisible(false);
  }

  update(status: GuidanceStatus, near: boolean, visible: boolean): void {
    const text = status === "available" ? (near ? "! E 接取委托" : "!")
      : status === "ready" ? (near ? "? 材料齐 · E 交谈" : "?")
      : near ? "E 交谈" : "";
    const key = `${text}:${status}`;
    if (key !== this.last) {
      this.last = key;
      this.badge.setText(text).setColor(status === "ready" ? "#d7f2b0" : "#fff1b7");
    }
    this.badge.setVisible(visible && text !== "");
  }

  hide(): void { this.badge.setVisible(false); }
  destroy(): void { this.badge.destroy(); }
}
