import Phaser from "phaser";
import { SCENE_FARM } from "../config";
import { getGameSession } from "../systems/GameSession";
import { FarmEnvironment } from "../systems/farmEnvironment";
import { getFarmAudio } from "../systems/farmAudio";
import { AudioSettingsMenu } from "../../ui/AudioSettingsMenu";

export class TitleScene extends Phaser.Scene {
  private info!: Phaser.GameObjects.Text;
  private entering = false;
  private freshArmed = false;
  private audioSettings!: AudioSettingsMenu;
  constructor() { super("title"); }
  preload(): void { FarmEnvironment.preload(this); }
  create(): void {
    this.entering = false;
    this.freshArmed = false;
    const session = getGameSession();
    this.audioSettings = new AudioSettingsMenu(this);
    getFarmAudio().setEnvironment("title", session.weather.current().type, session.life.minute);
    getFarmAudio().setPaused(true);
    const hasSave = session.save.load() !== null;
    const stored = session.save.hasStoredData();
    this.cameras.main.setBackgroundColor("#2b3821");
    new FarmEnvironment(this);
    if (this.textures.exists("TX Tileset Grass")) {
      for (let r = 0; r < 12; r++) for (let c = 0; c < 16; c++) {
        this.add.image(c * 32, r * 32, "TX Tileset Grass", `TX Tileset Grass ${(r + c) % 3}`).setOrigin(0);
      }
      if (this.textures.get("TX Plant").has("farm-tree-T3")) {
        for (const [x, y, type] of [[45, 175, "T3"], [470, 180, "T2"], [50, 390, "T2"], [463, 391, "T3"]] as const) {
          this.add.image(x, y, "TX Plant", `farm-tree-${type}`).setOrigin(0.5, 1);
        }
      }
    }
    this.add.rectangle(256, 192, 512, 384, 0x19271c, 0.63);
    this.add.text(256, 61, "灵镜档案", {
      fontSize: "42px", fontFamily: "monospace", color: "#f1ddab", stroke: "#4b3820", strokeThickness: 4,
    }).setOrigin(0.5);
    this.add.text(256, 109, "小型测试版 · 林缘农场", {
      fontSize: "14px", color: "#c4cda7", fontFamily: "monospace",
    }).setOrigin(0.5);
    const option = (y: number, label: string, action: () => void) => {
      this.add.rectangle(256, y, 248, 39, 0x5b452b).setStrokeStyle(2, 0xad8750);
      const text = this.add.text(256, y, label, { fontSize: "17px", fontFamily: "monospace", color: "#f4e4bd" })
        .setOrigin(0.5).setInteractive({ useHandCursor: true }).on("pointerdown", action);
      text.on("pointerover", () => text.setColor("#fff5cf"));
      text.on("pointerout", () => text.setColor("#f4e4bd"));
    };
    option(176, hasSave ? "继续农场　Enter" : stored ? "存档需要恢复" : "开始农场　Enter", () => this.enterFarm(!stored));
    option(222, "新的一段生活　N", () => this.enterFarm(true));
    if (session.save.hasBackup()) option(268, "恢复上一份存档　R", () => this.restoreBackup());
    this.info = this.add.text(256, 320,
      stored && !hasSave ? "当前存档无法读取。可恢复备份，或按 N 开始新游戏。" : "E 交互 · I 背包 · L 区域手记 · K 制作 · 沿路步行探索", {
        fontFamily: "monospace", fontSize: "11px", color: "#d0cfb2", align: "center", wordWrap: { width: 452 },
      }).setOrigin(0.5);
    const keyboard = this.input.keyboard!;
    this.add.text(256, 358, "M 声音设置", { fontSize: "12px", fontFamily: "monospace", color: "#dfc48e" })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.audioSettings.open());
    keyboard.on("keydown-M", () => { if (!this.entering) this.audioSettings.open(); });
    keyboard.on("keydown-ENTER", () => this.enterFarm(!stored));
    keyboard.on("keydown-N", () => this.enterFarm(true));
    keyboard.on("keydown-R", () => this.restoreBackup());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.audioSettings.destroy(); getFarmAudio().setPaused(true);
      for (const key of ["keydown-ENTER", "keydown-N", "keydown-R", "keydown-M"]) keyboard.off(key);
    });
  }
  private enterFarm(fresh: boolean): void {
    if (this.entering || this.audioSettings.isOpen) return;
    const session = getGameSession();
    if (fresh) {
      if (session.save.hasStoredData() && !this.freshArmed) {
        this.freshArmed = true;
        this.info.setText("已有存档。再次按 N 开始新游戏；旧存档会保留为备份。"); return;
      }
      if (!session.save.clear()) { this.info.setText("旧存档备份失败，未开始新游戏。请检查浏览器存储空间。"); return; }
      session.newGame();
    } else if (!session.loadGame()) {
      this.info.setText("存档无法恢复。可按 R 恢复备份，或按 N 开始新游戏。"); return;
    }
    this.entering = true;
    getFarmAudio().play("confirm");
    this.scene.start(SCENE_FARM);
  }
  private restoreBackup(): void {
    if (this.entering || this.audioSettings.isOpen) return;
    const session = getGameSession();
    if (!session.save.restoreBackup() || !session.loadGame()) {
      this.info.setText("没有可读取的备份，当前存档没有被替换。"); return;
    }
    this.entering = true;
    this.scene.start(SCENE_FARM);
  }
}
