import Phaser from "phaser";
import { Player } from "../entities/Player";
import { SCENE_FARM, SCENE_TITLE } from "../config";
import { FarmEnvironment } from "../systems/farmEnvironment";
import { getGameSession } from "../systems/GameSession";
import { FarmMenu } from "../../ui/FarmMenu";
import { ChestMenu } from "../../ui/ChestMenu";
import { FarmAtmosphere, type AtmosphereWeather } from "../systems/farmAtmosphere";
import { getFarmAudio } from "../systems/farmAudio";
import { AudioSettingsMenu } from "../../ui/AudioSettingsMenu";
import { CraftingMenu } from "../../ui/CraftingMenu";
import { TravelMenu } from "../../ui/TravelMenu";

const SEASONS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const WEATHER = { sunny: "晴", cloudy: "阴", rain: "雨" };
const TEXT = { fontFamily: "monospace", fontSize: "11px", color: "#f0dfb9" };

/** Small connected room. Date, inventory and farming use the existing shared session. */
export class HomeScene extends Phaser.Scene {
  private player!: Player;
  private menu!: FarmMenu;
  private chestMenu!: ChestMenu;
  private audioSettings!: AudioSettingsMenu;
  private crafting!: CraftingMenu;
  private travel!: TravelMenu;
  private lastStepX = 256;
  private lastStepY = 304;
  private hud!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private atmosphere!: FarmAtmosphere;
  private furniture: Phaser.Physics.Arcade.Image[] = [];
  private sleepTimer?: Phaser.Time.TimerEvent;
  private sleeping = false;
  private leaving = false;
  private lastDay = -1;
  private lastGold = -1;
  private lastMinute = -1;
  private lastEnergy = -1;
  private lastSeason = "";
  private lastWeather?: AtmosphereWeather;
  private clockWasPaused = true;
  private timeSaveFailed = false;
  private readonly visibilityChanged = () => {
    if (document.hidden) {
      this.clockWasPaused = true;
      this.player?.sprite.setVelocity(0, 0);
    }
  };
  private down!: Phaser.Input.Keyboard.Key;
  private south!: Phaser.Input.Keyboard.Key;

  constructor() { super("home"); }

  preload(): void {
    FarmEnvironment.preload(this);
    const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v2/`;
    for (const [key, file] of [["home-floor", "interior-floor-v1.png"], ["home-bed", "bed-v1.png"]]) {
      if (!this.textures.exists(key)) this.load.image(key, `${base}${file}`);
    }
  }

  create(): void {
    this.sleeping = false;
    this.leaving = false;
    this.lastDay = this.lastGold = this.lastMinute = this.lastEnergy = -1;
    this.lastSeason = "";
    this.lastWeather = undefined;
    this.clockWasPaused = true;
    this.timeSaveFailed = false;
    this.furniture = [];
    this.physics.world.resume();
    this.physics.world.setBounds(96, 80, 320, 272);
    this.input.enabled = true;
    this.input.keyboard!.enabled = true;
    this.input.keyboard!.resetKeys();
    const camera = this.cameras.main;
    camera.stopFollow(); camera.setScroll(0, 0); camera.setZoom(1); camera.setBounds(0, 0, 512, 384);
    camera.setBackgroundColor("#252a21");

    // Material imagery supplies the floor; restrained solid borders only define walls.
    this.add.rectangle(256, 210, 344, 296, 0x57452e).setStrokeStyle(4, 0x281f19);
    if (this.textures.exists("home-floor")) {
      this.add.image(256, 216, "home-floor").setDisplaySize(320, 272);
    } else {
      for (let r = 0; r < 9; r++) for (let c = 0; c < 10; c++) {
        const height = Math.min(32, 352 - (80 + r * 32));
        this.add.image(96 + c * 32, 80 + r * 32, "tile_soil").setOrigin(0).setDisplaySize(32, height);
      }
    }
    this.add.rectangle(256, 73, 334, 14, 0x957248).setStrokeStyle(2, 0x392c21);
    this.add.rectangle(90, 216, 12, 280, 0x80613e);
    this.add.rectangle(422, 216, 12, 280, 0x80613e);
    this.add.rectangle(168, 352, 144, 8, 0x695036);
    this.add.rectangle(344, 352, 144, 8, 0x695036);
    // A simple bright window above the walkable room, and the open doorway threshold.
    this.add.rectangle(250, 88, 42, 25, 0x9eb9a4).setStrokeStyle(3, 0x725234);
    this.add.rectangle(250, 88, 3, 25, 0x725234);
    this.add.rectangle(250, 88, 42, 3, 0x725234);
    this.add.rectangle(256, 339, 48, 23, 0x7b613f).setStrokeStyle(2, 0xc19a60);

    const bedKey = this.textures.exists("home-bed") ? "home-bed" : "tile_bed";
    if (bedKey === "home-bed" && !this.textures.get(bedKey).has("trimmed")) {
      this.textures.get(bedKey).add("trimmed", 0, 208, 168, 637, 1181);
    }
    const bed = this.physics.add.staticImage(350, 160, bedKey,
      bedKey === "home-bed" ? "trimmed" : undefined).setDisplaySize(44, 80);
    bed.refreshBody(); this.furniture.push(bed);
    const props = this.textures.get("TX Props");
    const chestFrame = props.has("TX Props Chest") ? "TX Props Chest" : "TX Props Crate Small";
    const chest = this.physics.add.staticImage(160, 130, "TX Props", chestFrame).setDisplaySize(40, 32);
    chest.refreshBody(); this.furniture.push(chest);
    this.add.text(350, 110, "床 · E 睡觉", TEXT).setOrigin(0.5);
    this.add.text(160, 101, "木箱 · E 存取", TEXT).setOrigin(0.5);
    if (props.has("TX Props Barrel")) this.add.image(385, 296, "TX Props", "TX Props Barrel").setDisplaySize(24, 28);

    this.player = new Player(this, 256, 304);
    this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    for (const object of this.furniture) this.physics.add.collider(this.player.sprite, object);
    this.menu = new FarmMenu(this, () => {});
    this.chestMenu = new ChestMenu(this);
    this.audioSettings = new AudioSettingsMenu(this);
    this.crafting = new CraftingMenu(this);
    this.travel = new TravelMenu(this);
    this.atmosphere = new FarmAtmosphere(this, true);
    this.add.rectangle(256, 26, 480, 36, 0x4c3927).setStrokeStyle(1, 0xad8650).setDepth(98);
    this.hud = this.add.text(256, 16, "", TEXT).setOrigin(0.5, 0).setDepth(99);
    this.status = this.add.text(256, 49, "林缘小屋 · 在床边按 E 休息", { ...TEXT, color: "#dfc48e" })
      .setOrigin(0.5, 0).setWordWrapWidth(464).setAlign("center").setDepth(99);
    const controls = this.add.text(256, 368, "WASD 移动 · E 交互 · I 背包 · L 区域手记 · K 制作", TEXT).setOrigin(0.5).setDepth(99);
    controls.setScale(Math.min(1, 488 / controls.width));
    this.refreshHud();
    const session = getGameSession();
    this.atmosphere.update(session.life.minute, session.weather.current().type, 0);
    const keyboard = this.input.keyboard!;
    this.down = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.south = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    keyboard.on("keydown-E", this.interact, this);
    keyboard.on("keydown-I", this.openInventory, this);
    keyboard.on("keydown-B", this.openMarket, this);
    keyboard.on("keydown-T", this.returnToTitle, this);
    keyboard.on("keydown-M", this.openAudio, this);
    keyboard.on("keydown-K", this.openCraft, this);
    keyboard.on("keydown-L", this.openTravel, this);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private busy(): boolean { return this.leaving || this.sleeping || this.menu.isOpen || this.chestMenu.isOpen || this.audioSettings.isOpen || this.crafting.isOpen || this.travel.isOpen; }
  private openCraft(): void { if (!this.busy()) this.crafting.open(); }
  private openTravel(): void { if (!this.busy()) this.travel.open(); }
  private openAudio(): void { if (!this.busy()) this.audioSettings.open(); }
  private openInventory(): void {
    if (this.busy()) return;
    this.player.sprite.setVelocity(0, 0); this.menu.open("inventory");
  }
  private openMarket(): void {
    if (this.busy()) return;
    this.player.sprite.setVelocity(0, 0); this.menu.open("market");
  }
  private interact(): void {
    if (this.busy()) return;
    const x = this.player.x, y = this.player.y;
    if (Math.abs(x - 350) <= 64 && Math.abs(y - 160) <= 72) {
      this.sleeping = true;
      this.player.sprite.setVelocity(0, 0);
      const session = getGameSession();
      const date = session.sleep();
      const saved = session.saveGame();
      getFarmAudio().play(saved ? "sleep" : "error");
      this.status.setText(saved ? `休息好了 · ${SEASONS[date.season]} ${date.day}日 · 已保存`
        : `已到第${date.day}天，保存失败；请留在游戏内，按 T 重试保存`);
      this.refreshHud();
      this.atmosphere.update(session.life.minute, session.weather.current().type, 0);
      this.sleepTimer = this.time.delayedCall(450, () => { this.sleeping = false; this.sleepTimer = undefined; });
    } else if (Math.abs(x - 160) <= 56 && Math.abs(y - 130) <= 52) {
      this.player.sprite.setVelocity(0, 0); this.chestMenu.open();
    } else if (Math.abs(x - 256) <= 32 && y >= 290) {
      this.exitHome();
    } else this.status.setText("靠近床或木箱按 E · 从下方门口返回农场");
  }

  private exitHome(): void {
    if (this.busy()) return;
    this.leaving = true;
    getFarmAudio().play("door");
    this.scene.start(SCENE_FARM, { fromHome: true });
  }
  private returnToTitle(): void {
    if (this.busy()) return;
    if (!getGameSession().saveGame()) {
      getFarmAudio().play("error");
      this.status.setText("保存失败，仍留在房间；请检查浏览器存储空间后重试 T"); return;
    }
    this.leaving = true;
    this.scene.start(SCENE_TITLE);
  }
  private refreshHud(): void {
    const session = getGameSession(), date = session.time.date;
    this.lastDay = date.day; this.lastGold = session.economy.goldValue;
    this.lastMinute = session.life.minute; this.lastEnergy = session.life.energy;
    this.lastSeason = date.season; this.lastWeather = session.weather.current().type;
    this.hud.setText(`林缘小屋　${SEASONS[date.season]} ${date.day}日 · ${WEATHER[this.lastWeather]}　${session.life.clockText}　体力 ${session.life.energy}　${session.economy.goldValue} 金`);
    this.hud.setScale(Math.min(1, 456 / Math.max(1, this.hud.width)));
  }

  update(_time: number, delta: number): void {
    const audio = getFarmAudio();
    if (this.busy() || document.hidden) {
      audio.setPaused(true);
      this.clockWasPaused = true;
      this.player.sprite.setVelocity(0, 0);
      return;
    }
    this.player.update(delta);
    const session = getGameSession();
    audio.setEnvironment("home", session.weather.current().type, session.life.minute);
    audio.setPaused(false);
    if (Math.hypot(this.player.x - this.lastStepX, this.player.y - this.lastStepY) >= 8) {
      audio.play("step"); this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    }
    // Discard the first resumed frame so a suspended tab/menu cannot catch up time.
    const clockDelta = this.clockWasPaused ? 0 : delta;
    this.clockWasPaused = false;
    if (session.advanceTime(clockDelta)) {
      const saved = session.saveGame();
      if (!saved && !this.timeSaveFailed) this.status.setText("时间已推进，但保存失败；请留在游戏内，按 T 重试保存");
      else if (saved && this.timeSaveFailed) this.status.setText("时间进度已重新保存 · 在床边按 E 休息");
      this.timeSaveFailed = !saved;
      if (session.life.isLate && saved && this.lastMinute < 1320) this.status.setText("夜深了 · 到床边按 E 休息，开始新的一天");
    }
    this.atmosphere.update(session.life.minute, session.weather.current().type, clockDelta);
    if (this.lastDay !== session.time.date.day || this.lastGold !== session.economy.goldValue
      || this.lastSeason !== session.time.date.season || this.lastWeather !== session.weather.current().type
      || this.lastMinute !== session.life.minute || this.lastEnergy !== session.life.energy) this.refreshHud();
    if ((this.down.isDown || this.south.isDown) && this.player.y >= 320 && Math.abs(this.player.x - 256) <= 28) this.exitHome();
  }

  private shutdown(): void {
    const keyboard = this.input.keyboard;
    keyboard?.off("keydown-E", this.interact, this);
    keyboard?.off("keydown-I", this.openInventory, this);
    keyboard?.off("keydown-B", this.openMarket, this);
    keyboard?.off("keydown-T", this.returnToTitle, this);
    keyboard?.off("keydown-M", this.openAudio, this);
    keyboard?.off("keydown-K", this.openCraft, this);
    keyboard?.off("keydown-L", this.openTravel, this);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.sleepTimer?.destroy(); this.sleepTimer = undefined;
    this.menu?.destroy(); this.chestMenu?.destroy();
    this.crafting?.destroy(); this.travel?.destroy();
    this.audioSettings?.destroy(); getFarmAudio().setPaused(true);
    this.atmosphere?.destroy();
    this.player?.destroy();
    for (const object of this.furniture) object.destroy();
    this.furniture = [];
    this.sleeping = false;
  }
}
