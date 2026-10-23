import Phaser from "phaser";
import { createForestMap, createTownMap, type ExplorationKind, type ExplorationMap } from "../../data/maps/explorationMaps";
import { Player } from "../entities/Player";
import { FarmEnvironment } from "../systems/farmEnvironment";
import { planForestDetails } from "../systems/forestDetails";
import { FarmAtmosphere } from "../systems/farmAtmosphere";
import { getGameSession } from "../systems/GameSession";
import { getFarmAudio } from "../systems/farmAudio";
import { FarmMenu } from "../../ui/FarmMenu";
import { AudioSettingsMenu } from "../../ui/AudioSettingsMenu";
import { ResidentDialogue } from "../../ui/ResidentDialogue";
import { CraftingMenu } from "../../ui/CraftingMenu";
import { TravelMenu } from "../../ui/TravelMenu";
import { openAreaExits, arrivalFrom, type AreaId } from "../../data/maps/areaConnections";
import { AreaPassage } from "../systems/areaPassage";
import { FORAGE_NODES } from "../../data/exploration";
import { getQuestGuidance, type QuestGuidance } from "../../ui/questGuidance";
import { compactQuestText, townFrontageHint } from "../../ui/explorationHud";
import { selectExplorationTarget, type ExplorationTarget } from "../../ui/explorationTarget";
import { ResidentMarker } from "../systems/residentMarker";
import { ResidentMotion } from "../systems/residentMotion";
import { TreeOcclusion } from "../systems/treeOcclusion";
import { ActiveNotice } from "../systems/activeNotice";
import { addWoodPanel } from "../../ui/woodPanel";

const TILE = 32;
const SEASONS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const WEATHER = { sunny: "晴", cloudy: "阴", rain: "雨" };
const TEXT = { fontFamily: "monospace", fontSize: "11px", color: "#f0dfb9" };
const NODE_NAMES = { branch: "枯枝", stone: "溪石", wild_mushroom: "野蘑菇" };
const FAILURES: Record<string, string> = {
  ALREADY_PICKED: "这里已采集，睡一觉后明天再来", TOO_TIRED: "体力不足，回农舍休息或制作蘑菇餐",
  INVENTORY_FULL: "背包已满，请先存放或出售物品", SAVE_FAILED: "保存失败，采集已撤回；请留在游戏内重试",
};

/** Connected beta areas share the real session, clock, audio and modal lifecycle. */
class ExplorationScene extends Phaser.Scene {
  public player!: Player;
  public resident!: Phaser.Physics.Arcade.Image;
  public nodeDisplays = new Map<string, Phaser.GameObjects.Image>();
  public worldMap!: ExplorationMap;
  private environment!: FarmEnvironment;
  private atmosphere!: FarmAtmosphere;
  private menu!: FarmMenu;
  private dialogue!: ResidentDialogue;
  private crafting!: CraftingMenu;
  private travelMenu!: TravelMenu;
  private passage?: AreaPassage;
  private fromArea?: AreaId;
  private audioSettings!: AudioSettingsMenu;
  private hud!: Phaser.GameObjects.Text;
  private materials!: Phaser.GameObjects.Text;
  private contextHint!: Phaser.GameObjects.Text;
  private questHint!: Phaser.GameObjects.Text;
  private residentMarker!: ResidentMarker;
  private residentMotion?: ResidentMotion;
  private treeOcclusion?: TreeOcclusion;
  private occlusionDelta = 0;
  // Player synchronizes its display in POST_UPDATE before this listener runs.
  private readonly updateTreeOcclusion = (): void => {
    this.treeOcclusion?.update(this.player, this.occlusionDelta, this.busy() || document.hidden);
  };
  private nodeFocus!: Phaser.GameObjects.Graphics;
  private focusId = "";
  private lastGuidance = "";
  private readonly notice = new ActiveNotice();
  private lastState = "";
  private lastStepX = 0;
  private lastStepY = 0;
  private clockPaused = true;
  private leaving = false;
  private saveFailed = false;
  private readonly onVisibility = (): void => {
    if (document.hidden) { this.clockPaused = true; this.player?.sprite.setVelocity(0, 0); this.hideGuidance(); getFarmAudio().setPaused(true); }
  };

  constructor(private readonly kind: ExplorationKind) { super(kind); }

  init(data?: { fromArea?: AreaId }): void { this.fromArea = data?.fromArea; }

  preload(): void {
    FarmEnvironment.preload(this);
    const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/`;
    if (!this.textures.exists("farm-home-path")) this.load.atlas("farm-home-path", `${base}v1/dirt-road-v1.png`, `${base}v1/dirt-road-v1.json`);
    if (!this.textures.exists("farmhouse-main")) this.load.image("farmhouse-main", `${base}v2/farmhouse-v1.png`);
  }

  create(): void {
    this.worldMap = openAreaExits(this.kind === "forest" ? createForestMap() : createTownMap(), this.kind);
    this.nodeDisplays = new Map(); this.lastState = ""; this.clockPaused = true;
    this.focusId = ""; this.lastGuidance = "";
    this.leaving = false; this.saveFailed = false; this.occlusionDelta = 0; this.notice.clear();
    this.physics.world.resume(); this.physics.world.setBounds(0, 0, this.worldMap.width * TILE, this.worldMap.height * TILE);
    this.input.enabled = true; this.input.keyboard!.enabled = true; this.input.keyboard!.resetKeys();
    this.environment = new FarmEnvironment(this);
    const solids = this.physics.add.staticGroup();
    for (let row = 0; row < this.worldMap.height; row++) for (let col = 0; col < this.worldMap.width; col++) {
      const tile = this.worldMap.tiles[row][col];
      if (!this.environment.render(tile, row, col, false)) this.add.image(col * TILE, row * TILE, "tile_grass").setOrigin(0).setDepth(0);
      if (tile.solid) {
        const body = solids.create((col + 0.5) * TILE, (row + 0.5) * TILE, "tile_fence") as Phaser.Physics.Arcade.Image;
        body.setDisplaySize(TILE, TILE).setVisible(false).refreshBody();
      }
    }
    this.renderPaths(); this.renderDecor();
    this.environment.applySeason(getGameSession().time.date.season);
    const start = this.worldMap.start;
    this.player = new Player(this, (start.col + 0.5) * TILE, (start.row + 0.5) * TILE);
    const arrival = this.fromArea ? arrivalFrom(this.kind, this.fromArea, this.worldMap.width) : null;
    if (arrival) this.player.sprite.body!.reset(arrival.x, arrival.y);
    this.physics.add.collider(this.player.sprite, solids);
    this.createResident();
    this.physics.add.collider(this.player.sprite, this.resident);
    this.createNodes();
    this.nodeFocus = this.add.graphics().setDepth(19).setVisible(false);
    this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.worldMap.width * TILE, this.worldMap.height * TILE);
    camera.setZoom(1).setRoundPixels(true).startFollow(this.player.sprite, true, 0.1, 0.1);
    camera.setBackgroundColor("#454d28");
    this.menu = new FarmMenu(this, () => {});
    this.crafting = new CraftingMenu(this);
    this.dialogue = new ResidentDialogue(this, this.kind === "forest" ? "forest" : "carpenter", () => this.crafting.open());
    this.travelMenu = new TravelMenu(this);
    this.audioSettings = new AudioSettingsMenu(this);
    if (this.kind === "forest") {
      this.treeOcclusion = new TreeOcclusion(this.environment.treeImages);
      this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.updateTreeOcclusion);
    }
    this.atmosphere = new FarmAtmosphere(this);
    addWoodPanel(this, 8, 7, 496, 44, 98);
    this.hud = this.add.text(256, 13, "", TEXT).setOrigin(0.5, 0).setScrollFactor(0).setDepth(99);
    this.materials = this.add.text(256, 32, "", { ...TEXT, color: "#d8c592" }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(99);
    this.questHint = this.add.text(8, 58, "", {
      ...TEXT, backgroundColor: "#302e1ce8", padding: { x: 6, y: 5 },
    }).setScrollFactor(0).setDepth(100);
    addWoodPanel(this, 8, 332, 496, 48, 98);
    this.contextHint = this.add.text(256, 346, "", { ...TEXT, wordWrap: { width: 476 }, align: "center" }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    const controls = this.add.text(256, 370, "WASD 移动 · E 交互 · L 手记 · K 制作 · I 背包 · M 声音", { ...TEXT, fontSize: "10px", color: "#c9b88e" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(100);
    controls.setScale(Math.min(1, 492 / controls.width));
    this.add.text((start.col + 0.5) * TILE, (start.row + 1.8) * TILE, `${this.kind === "forest" ? "东侧小路" : "西侧乡道"}通往农场`, { ...TEXT, fontSize: "10px", backgroundColor: "#393421bb" })
      .setOrigin(0.5).setDepth(3);
    const keyboard = this.input.keyboard!;
    keyboard.on("keydown-E", this.interact, this);
    keyboard.on("keydown-L", this.openTravel, this);
    keyboard.on("keydown-K", this.openCrafting, this);
    keyboard.on("keydown-I", this.openInventory, this);
    keyboard.on("keydown-B", this.openMarket, this);
    keyboard.on("keydown-M", this.openAudio, this);
    keyboard.on("keydown-T", this.returnToTitle, this);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.refreshState();
    this.passage = new AreaPassage(this, this.kind, this.worldMap, this.player.sprite,
      () => getGameSession().saveGame(), () => { this.leaving = true; this.hideGuidance(); },
      () => this.notify("保存失败，仍留在当前区域；请稍后重试路口"));
  }

  private renderPaths(): void {
    const paths = new Set(this.worldMap.paths.map(p => `${p.row}_${p.col}`));
    if (!this.textures.exists("farm-home-path")) return;
    for (const p of this.worldMap.paths) {
      const n = paths.has(`${p.row - 1}_${p.col}`), s = paths.has(`${p.row + 1}_${p.col}`);
      const w = paths.has(`${p.row}_${p.col - 1}`), e = paths.has(`${p.row}_${p.col + 1}`);
      const frame = !n ? (!w ? "nw" : !e ? "ne" : "n") : !s ? (!w ? "sw" : !e ? "se" : "s") : !w ? "w" : !e ? "e" : "center";
      this.add.image(p.col * TILE, p.row * TILE, "farm-home-path", frame).setOrigin(0).setDisplaySize(TILE, TILE).setDepth(1);
    }
  }

  private renderDecor(): void {
    const occupied = new Set([...this.worldMap.paths, ...this.worldMap.clearings, this.worldMap.start, this.worldMap.resident, ...this.worldMap.nodes, ...this.worldMap.props].map(p => `${p.row}_${p.col}`));
    if (this.kind === "forest") this.environment.renderDetailPlan(planForestDetails(this.worldMap));
    else if (this.textures.exists("TX Plant")) for (let r = 2; r < 22; r++) for (let c = 2; c < 30; c++) {
      if (this.worldMap.tiles[r][c].solid || occupied.has(`${r}_${c}`) || (r * 3 + c * 7) % 3 !== 0) continue;
      const frame = (r + c) % 4 ? "TX Plant - Grass 07" : "TX Plant - Flower 01";
      this.add.image(c * TILE + 12, r * TILE + 22, "TX Plant", frame).setOrigin(0.5, 1).setDepth(2);
      this.add.image(c * TILE + 24, r * TILE + 29, "TX Plant", "TX Plant - Grass 10").setOrigin(0.5, 1).setDepth(2);
    }
    for (const prop of this.worldMap.props) {
      if (!this.textures.exists("TX Props") || !this.textures.get("TX Props").has(prop.frame)) continue;
      const image = this.add.image((prop.col + 0.5) * TILE, (prop.row + 1) * TILE, "TX Props", prop.frame).setOrigin(0.5, 1);
      image.setScale(Math.min(1, 42 / image.frame.realHeight, 46 / image.frame.realWidth));
      image.setDepth(FarmEnvironment.objectDepth(image.y));
    }
    for (const b of this.worldMap.buildings) {
      const frame = b.label === "木匠工坊" ? "workshop" : b.label === "林缘会馆" ? "hall" : null;
      const useTownArt = frame && this.textures.exists("farm-town-buildings-v1")
        && this.textures.get("farm-town-buildings-v1").has(frame);
      if (useTownArt) {
        const image = this.add.image((b.col + b.width / 2) * TILE, (b.row + b.height) * TILE, "farm-town-buildings-v1", frame)
          .setOrigin(0.5, 1);
        image.setScale(b.width * TILE / image.frame.realWidth).setDepth(FarmEnvironment.objectDepth(image.y));
      } else if (this.textures.exists("farmhouse-main")) {
        const texture = this.textures.get("farmhouse-main");
        if (!texture.has("trimmed")) texture.add("trimmed", 0, 44, 164, 1117, 1033);
        const image = this.add.image((b.col + b.width / 2) * TILE, (b.row + b.height) * TILE, "farmhouse-main", "trimmed").setOrigin(0.5, 1);
        image.setScale(b.width * TILE / image.frame.realWidth).setDepth(FarmEnvironment.objectDepth(image.y));
        if (b.label === "林缘会馆") image.setTint(0xc7c7a9);
      }
      this.add.text(b.col * TILE + 4, (b.row + b.height) * TILE + 8, b.label, {
        ...TEXT, fontSize: "10px", backgroundColor: "#493a25ed", padding: { x: 3, y: 2 },
      }).setOrigin(0).setDepth(12);
    }
  }

  private createResident(): void {
    const plot = this.worldMap.resident, x = (plot.col + 0.5) * TILE, y = (plot.row + 0.5) * TILE;
    this.resident = this.physics.add.staticImage(x, y, "player_0").setVisible(false);
    this.resident.setDisplaySize(32, 28).refreshBody();
    const frame = this.kind === "forest" ? "guide" : "carpenter";
    let key = "farm-beta-npcs", artFrame: string | undefined = frame;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) {
      key = this.textures.exists("farm-merchant-v1") ? "farm-merchant-v1" : "player_0";
      if (key === "farm-merchant-v1" && !this.textures.get(key).has("trimmed")) this.textures.get(key).add("trimmed", 0, 258, 216, 576, 1096);
      artFrame = key === "farm-merchant-v1" ? "trimmed" : undefined;
    }
    const image = this.add.image(x, y + 16, key, artFrame).setOrigin(0.5, 1).setScale(1);
    image.setScale(44 / image.frame.realHeight).setDepth(FarmEnvironment.objectDepth(y + 16));
    this.residentMotion = new ResidentMotion(this, image, this.kind === "forest" ? "guide" : "carpenter");
    const labelY = image.y - image.displayHeight - 5;
    this.add.text(x, labelY, this.kind === "forest" ? "岚 · 林缘向导" : "阿榆 · 木匠", { ...TEXT, fontSize: "10px", backgroundColor: "#342c1fcc" })
      .setOrigin(0.5, 1).setDepth(12);
    this.residentMarker = new ResidentMarker(this, x, labelY - 16);
  }

  private createNodes(): void {
    for (const node of this.worldMap.nodes) {
      const art = this.textures.exists("farm-forage-v1") && this.textures.get("farm-forage-v1").has(node.itemId);
      const image = this.add.image((node.col + 0.5) * TILE, (node.row + 1) * TILE - 3, art ? "farm-forage-v1" : "TX Props", art ? node.itemId : "TX Props - Stone 01")
        .setOrigin(0.5, 1).setDepth(3);
      image.setScale(Math.min(24 / image.frame.realWidth, 24 / image.frame.realHeight));
      this.nodeDisplays.set(node.id, image);
    }
  }

  private busy(): boolean { return this.leaving || this.menu.isOpen || this.dialogue.isOpen || this.crafting.isOpen || this.travelMenu.isOpen || this.audioSettings.isOpen; }
  private openTravel(): void { if (!this.busy()) this.travelMenu.open(); }
  private openCrafting(): void { if (!this.busy()) this.crafting.open(); }
  private openAudio(): void { if (!this.busy()) this.audioSettings.open(); }
  private openInventory(): void { if (!this.busy()) this.menu.open("inventory"); }
  private openMarket(): void { if (!this.busy()) this.menu.open("market"); }
  private interactionTarget(): ExplorationTarget {
    return selectExplorationTarget(this.player, this.resident, this.worldMap.nodes, getGameSession().exploration.state.picked);
  }
  private interact(): void {
    if (this.busy()) return;
    this.player.sprite.setVelocity(0, 0);
    const target = this.interactionTarget();
    if (target?.kind === "resident") { this.dialogue.open(); return; }
    const node = target?.kind === "node" ? target.node : undefined;
    if (!node) { this.notify(this.kind === "forest" ? "靠近枯枝、石块或野蘑菇按 E 采集" : "靠近阿榆按 E 对话 · K 制作 · 西侧道路回农场"); return; }
    const result = getGameSession().gatherNode(node.id);
    getFarmAudio().play(result.ok ? "harvest" : "error");
    this.notify(result.ok ? `拾得${NODE_NAMES[node.itemId]} · 已保存` : FAILURES[result.reason] ?? "暂时无法采集");
    this.refreshState();
  }
  private returnToTitle(): void {
    if (this.busy()) return;
    if (!getGameSession().saveGame()) { getFarmAudio().play("error"); this.notify("保存失败，仍留在当前区域；请稍后重试 T"); return; }
    this.leaving = true; this.scene.start("title");
  }
  private notify(message: string): void {
    this.notice.show(message);
  }
  private refreshState(): void {
    const session = getGameSession(), state = session.exploration.state, date = session.time.date;
    const name = this.kind === "forest" ? "林缘森林" : "溪桥镇";
    this.hud.setText(`${name}　${SEASONS[date.season]} ${date.day}日 · ${WEATHER[session.weather.current().type]}　${session.life.clockText}　体力 ${session.life.energy}　${session.economy.goldValue} 金`);
    this.hud.setScale(Math.min(1, 480 / this.hud.width));
    this.materials.setText(`枯枝 ${session.inventory.count("branch")}　溪石 ${session.inventory.count("stone")}　野蘑菇 ${session.inventory.count("wild_mushroom")}　蘑菇餐 ${session.inventory.count("mushroom_meal")}`);
    for (const [id, image] of this.nodeDisplays) image.setAlpha(state.picked.includes(id) ? 0.3 : 1);
    this.lastState = JSON.stringify([date, session.life.serialize(), session.economy.goldValue, session.inventory.serialize(), state]);
  }

  private hideGuidance(): void {
    this.notice.update(0, true);
    this.occlusionDelta = 0;
    this.treeOcclusion?.update(this.player, 0, true);
    this.residentMotion?.update(0, false, true);
    this.nodeFocus?.setVisible(false); this.residentMarker?.hide();
    this.questHint?.setVisible(false); this.contextHint?.setVisible(false);
  }

  private updateGuidance(target: ExplorationTarget, guidance: QuestGuidance): void {
    const key = compactQuestText(guidance, getGameSession().exploration.state.picked.length, FORAGE_NODES.length);
    this.questHint.setVisible(target?.kind !== "resident"); this.contextHint.setVisible(true);
    if (key !== this.lastGuidance) {
      this.lastGuidance = key;
      this.questHint.setScale(1).setText(key);
      this.questHint.setScale(Math.min(1, 244 / this.questHint.width));
    }
    this.residentMarker.update(guidance.status, target?.kind === "resident", true);
    const focused = target?.kind === "node" && !target.picked ? target.node : null;
    this.nodeFocus.setVisible(focused !== null);
    if (focused?.id === this.focusId || !focused) return;
    this.focusId = focused.id;
    const x = focused.col * TILE + 2, y = focused.row * TILE + 2, size = 28, corner = 6;
    this.nodeFocus.clear().lineStyle(2, 0xf4d68c, 1);
    for (const [dx, dy, sx, sy] of [[0, 0, 1, 1], [size, 0, -1, 1], [0, size, 1, -1], [size, size, -1, -1]]) {
      this.nodeFocus.lineBetween(x + dx, y + dy, x + dx + sx * corner, y + dy);
      this.nodeFocus.lineBetween(x + dx, y + dy, x + dx, y + dy + sy * corner);
    }
  }

  update(_time: number, delta: number): void {
    const audio = getFarmAudio();
    if (this.busy() || document.hidden) {
      this.hideGuidance();
      this.clockPaused = true; this.player.sprite.setVelocity(0, 0); audio.setPaused(true); return;
    }
    const session = getGameSession(), clockDelta = this.clockPaused ? 0 : delta;
    this.clockPaused = false;
    this.occlusionDelta = clockDelta;
    this.player.update(delta);
    audio.setEnvironment("farm", session.weather.current().type, session.life.minute); audio.setPaused(false);
    if (Math.hypot(this.player.x - this.lastStepX, this.player.y - this.lastStepY) >= 8) {
      audio.play("step"); this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    }
    if (session.advanceTime(clockDelta)) {
      const saved = session.saveGame();
      if (!saved && !this.saveFailed) this.notify("时间已推进，但保存失败；请留在游戏内重试保存");
      if (saved && this.saveFailed) this.notify("时间进度已重新保存");
      this.saveFailed = !saved;
    }
    this.atmosphere.update(session.life.minute, session.weather.current().type, clockDelta);
    const key = JSON.stringify([session.time.date, session.life.serialize(), session.economy.goldValue, session.inventory.serialize(), session.exploration.state]);
    if (key !== this.lastState) this.refreshState();
    const target = this.interactionTarget();
    this.residentMotion?.update(clockDelta, target?.kind === "resident", false);
    const guidance = getQuestGuidance(session, this.kind);
    this.updateGuidance(target, guidance);
    const hint = target?.kind === "resident" ? guidance.status === "available" ? "E 与居民交谈 · 接取委托" : guidance.status === "ready" ? "材料齐了 · E 与居民核对交付" : "E 对话 / 查看委托"
      : target?.kind === "node" ? target.picked ? "已采集 · 睡一觉后明天再来"
        : session.life.energy < 2 ? "体力不足 · K 吃菌菇餐，或沿路回农舍休息"
        : `E 采集${NODE_NAMES[target.node.itemId]} · 体力 -2`
      : this.passage?.hint() ?? (session.life.isLate ? `夜深了 · 沿${this.kind === "forest" ? "东" : "西"}侧小路回农场`
        : this.kind === "forest" ? "沿林间小路探索 · E 采集 · 东路回农场"
          : townFrontageHint(this.player, this.worldMap.buildings) ?? "工坊外找阿榆 · K 制作 · 西路回农场");
    const notice = this.notice.update(clockDelta, false);
    this.contextHint.setText(notice || hint).setColor(notice ? "#f5d693" : TEXT.color);
    this.passage?.update();
  }

  private shutdown(): void {
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.updateTreeOcclusion);
    this.treeOcclusion?.destroy(); this.treeOcclusion = undefined; this.occlusionDelta = 0;
    const keyboard = this.input.keyboard;
    keyboard?.off("keydown-E", this.interact, this); keyboard?.off("keydown-L", this.openTravel, this);
    keyboard?.off("keydown-K", this.openCrafting, this); keyboard?.off("keydown-I", this.openInventory, this);
    keyboard?.off("keydown-B", this.openMarket, this); keyboard?.off("keydown-M", this.openAudio, this);
    keyboard?.off("keydown-T", this.returnToTitle, this);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.notice.clear();
    this.menu?.destroy(); this.dialogue?.destroy(); this.crafting?.destroy(); this.travelMenu?.destroy(); this.audioSettings?.destroy();
    this.atmosphere?.destroy(); getFarmAudio().setPaused(true);
    this.passage?.destroy(); this.passage = undefined;
    this.residentMotion?.destroy(); this.residentMotion = undefined;
    this.residentMarker?.destroy(); this.nodeFocus?.destroy();
    this.player?.destroy(); this.resident?.destroy(); this.nodeDisplays.clear();
  }
}

export class ForestScene extends ExplorationScene { constructor() { super("forest"); } }
export class TownScene extends ExplorationScene { constructor() { super("town"); } }
