import Phaser from "phaser";
import { parseFarm01 } from "../../data/maps/farm01";
import type { TileDef } from "../../data/maps/farm01.types";
import { TILE, SCENE_TITLE } from "../config";
import { Player } from "../entities/Player";
import { getGameSession } from "../systems/GameSession";
import { computeTargetTile, tileIdOf } from "../utils/targetTile";
import { getItem } from "../../data/items";
import { ItemCategory } from "../../domain/models/Item";
import { getCropVisual, getSoilVisual } from "../systems/cropVisual";
import type { Season } from "../../domain/models/types";
// ── P5-A：纹理 key 解析唯一来源（与 placeholderAssets 共用，避免命名漂移）──
import { grassKey, rockKey, treeKey, waterKey } from "../systems/placeholderAssets";
import { FarmEnvironment } from "../systems/farmEnvironment";
import { FarmWater } from "../systems/farmWater";
import { FarmSoilSurface } from "../systems/farmSoilSurface";
import { FarmAtmosphere } from "../systems/farmAtmosphere";
import { FarmMenu } from "../../ui/FarmMenu";
import { chooseFarmhousePlot, type FarmhousePlot } from "../systems/farmhousePlot";
import { chooseMerchantPlot } from "../systems/merchantPlot";
import { MerchantResident } from "../systems/merchantResident";
import { MerchantDialogue } from "../../ui/MerchantDialogue";
import { getItemVisual } from "../systems/itemVisual";
import { getFarmAudio } from "../systems/farmAudio";
import { AudioSettingsMenu } from "../../ui/AudioSettingsMenu";
import { CraftingMenu } from "../../ui/CraftingMenu";
import { TravelMenu } from "../../ui/TravelMenu";
import { openAreaExits, areaExits, arrivalFrom, type AreaId } from "../../data/maps/areaConnections";
import { AreaPassage } from "../systems/areaPassage";
import { getQuestGuidance } from "../../ui/questGuidance";
import { addWoodPanel } from "../../ui/woodPanel";
import { ActiveNotice } from "../systems/activeNotice";
import { bindToolShortcut } from "../systems/toolShortcut";
import { FishingPanel } from "../../ui/FishingPanel";
import { pondCastTarget, type FishingSpot } from "../systems/fishingSpot";
import { PondLife } from "../systems/pondLife";

const TILE_TEXTURE: Record<TileDef["key"], string> = {
  grass: "tile_grass",
  fence: "tile_fence",
  tree: "tile_tree",
  rock: "tile_rock",
  soil: "tile_soil",
  bed: "tile_bed",
  water: "tile_water",
};

const SEASON_LABEL: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

// ── T4-3：允许开垦的地形 key ──────────────────────
const TILLABLE: ReadonlySet<TileDef["key"]> = new Set(["grass", "soil"]);

// ── T4-3：数字键 → 快捷栏槽位（0-based）────────────
const NUM_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"] as const;

// ── P5-A：按 (row,col) 确定性选变体纹理 + 当季映射 ──
// 三个取模公式与 P4 **逐字符一致** → 变体/树种的归属与季节无关，换季不会"重新洗牌"。
function tileTextureFor(key: TileDef["key"], r: number, c: number, season: Season): string {
  switch (key) {
    case "grass":
      // 4 变体轮转（行列混合取模，分布自然且确定性）
      return grassKey(season, ((r * 13 + c * 7) % 4 + 4) % 4);
    case "tree":
      // 每 5 棵 1 棵变体树
      return treeKey(season, (r * 11 + c * 5) % 5 === 0 ? 1 : 0);
    case "rock":
      // 每 3 块 1 块卧石
      return rockKey(season, (r * 3 + c * 17) % 3 === 0 ? 1 : 0);
    case "water":
      // 水面基础帧（具体帧由水波定时器按当季切换）
      return waterKey(season, 0);
    default:
      return TILE_TEXTURE[key];
  }
}

/**
 * 农场主场景：
 * - 渲染 farm01 地图（实心格进静态物理组提供碰撞，软格为纯显示，均格中心对齐）
 * - 玩家 WASD / 方向键移动
 * - 摄像机跟随并限制在世界内
 * - HUD 显示季节日期、金币、操作提示
 * - 靠近床按 E 睡觉 → 日期 +1 天，触发一次存档
 * - T4-3：数字键 1-8 切换快捷栏、左键按选中物品操作、目标格高亮、作物阶段渲染
 */
export class FarmScene extends Phaser.Scene {
  private player!: Player;
  private environment!: FarmEnvironment;
  private pond!: FarmWater;
  private soilSurface!: FarmSoilSurface;
  private atmosphere!: FarmAtmosphere;
  private lifeHud!: Phaser.GameObjects.Text;
  private energyBar!: Phaser.GameObjects.Rectangle;
  private clockPaused = true;
  private lastLifeKey = "";
  private readonly onVisibility = (): void => {
    if (document.hidden) { this.clockPaused = true; this.player?.sprite.setVelocity(0, 0); this.hideGuidance(); }
  };
  private menu!: FarmMenu;
  private audioSettings!: AudioSettingsMenu;
  private crafting!: CraftingMenu;
  private travel!: TravelMenu;
  private passage?: AreaPassage;
  private fromArea?: AreaId;
  private lantern?: Phaser.GameObjects.Image;
  private lanternGlow?: Phaser.GameObjects.Ellipse;
  private lastStepX = 0;
  private lastStepY = 0;
  private merchant: MerchantResident | null = null;
  private dialogue!: MerchantDialogue;
  private questHint!: Phaser.GameObjects.Text;
  private lastQuestKey = "";
  private saveNotice!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;
  private enteringHome = false;
  private returningHome = false;
  private housePlot: FarmhousePlot | null = null;
  private houseReserved: string[] = [];
  private contextHint!: Phaser.GameObjects.Text;
  private readonly notice = new ActiveNotice();
  private detachToolShortcut?: () => void;
  private fishingPanel!: FishingPanel;
  private pondLife!: PondLife;
  private fishingSpot: FishingSpot | null = null;
  private lastGold = -1;
  private lastDay = 0;

  // ── T4-3：新增字段 ────────────────────────────
  private world!: ReturnType<typeof parseFarm01>;
  private selectedSlot = 0;
  private tileHighlight!: Phaser.GameObjects.Rectangle;
  private cropSprites = new Map<string, Phaser.GameObjects.Image>();
  private tilledSprites = new Map<string, Phaser.GameObjects.Image>();
  private lastSnapshotKey = "";
  private lastTilledKey = "";
  private selectedNameText!: Phaser.GameObjects.Text;
  private selectedIcon!: Phaser.GameObjects.Image;
  private waterImages: Phaser.GameObjects.Image[] = [];
  private waterFrame = false;
  private waterTimer?: Phaser.Time.TimerEvent;

  // ── P5-A：四季外观 —— 地面图元缓存 + 当前季 ────
  // 换季只对这批图元做 setTexture：不销毁/不重建精灵、不动物理体、不碰玩家与相机。
  private groundTiles: {
    img: Phaser.GameObjects.Image;
    key: TileDef["key"];
    r: number;
    c: number;
  }[] = [];
  private season: Season = "spring";

  // ── P3：木质 HUD 面板与快捷栏选中态 ───────────
  private hotbarSlots: Phaser.GameObjects.Image[] = [];
  private hotbarIcons: Phaser.GameObjects.Image[] = [];
  private hotbarCounts: Phaser.GameObjects.Text[] = [];
  private hotbarSelected!: Phaser.GameObjects.Image;
  private lastHotbarKey = "";

  constructor() {
    super("farm");
  }

  init(data?: { fromHome?: boolean; fromArea?: AreaId }): void {
    this.returningHome = data?.fromHome === true;
    this.fromArea = data?.fromArea;
  }

  preload(): void {
    FarmEnvironment.preload(this);
    FarmWater.preload(this);
    if (!this.textures.exists("farm-fish-v1")) {
      const fish = `${import.meta.env.BASE_URL}farm-assets/original-addons/v9/fish-icons-v1`;
      this.load.atlas("farm-fish-v1", `${fish}.png`, `${fish}.json`);
    }
    const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/`;
    if (!this.textures.exists("farmhouse-main")) this.load.image("farmhouse-main", `${base}v2/farmhouse-v1.png`);
    if (!this.textures.exists("farm-merchant-v1")) this.load.image("farm-merchant-v1", `${base}v5/merchant-v1.png`);
    if (!this.textures.exists("farm-home-path")) {
      this.load.atlas("farm-home-path", `${base}v1/dirt-road-v1.png`, `${base}v1/dirt-road-v1.json`);
    }
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.enteringHome = false;
    this.notice.clear();
    this.physics.world.resume();
    this.input.enabled = true;
    this.input.keyboard!.enabled = true;
    this.input.keyboard!.resetKeys();
    this.clockPaused = true;
    this.lastLifeKey = "";
    this.lastQuestKey = "";
    this.merchant = null;
    document.addEventListener("visibilitychange", this.onVisibility);
    const session = getGameSession();
    const world = openAreaExits(parseFarm01(), "farm");
    this.world = world;
    this.housePlot = this.textures.exists("farmhouse-main")
      ? chooseFarmhousePlot(world, Object.keys(session.farming.serialize())) : null;
    this.houseReserved = [];
    if (this.housePlot) {
      for (let r = this.housePlot.row; r < this.housePlot.row + 4; r++) {
        const columns = r < this.housePlot.row + 2
          ? [this.housePlot.col, this.housePlot.col + 1, this.housePlot.col + 2, this.housePlot.col + 3]
          : [this.housePlot.col + 1, this.housePlot.col + 2];
        for (const c of columns) this.houseReserved.push(`${r}_${c}`);
      }
    }
    // Opened original fence cells are transport space, never valid saved farming IDs.
    for (const exit of areaExits("farm")) for (let row = exit.row; row < exit.row + 2; row++) {
      this.houseReserved.push(`${row}_${exit.edge === "left" ? 0 : world.width - 1}`);
    }

    // T4-3：重置跨 create 保留的实例状态（Phaser 场景实例跨 start 复用）
    this.selectedSlot = 0;
    this.cropSprites.clear();
    this.tilledSprites.clear();
    this.lastSnapshotKey = "";
    this.lastTilledKey = "";
    this.waterImages = [];
    this.waterFrame = false;
    this.hotbarSlots = [];
    this.hotbarIcons = [];
    this.hotbarCounts = [];
    this.lastHotbarKey = "";
    // P5-A：清空地面图元缓存，并把"当前季"对齐到会话真实季节
    // （必须在建格循环之前，循环用它选纹理 → 首帧即正确，无换季闪烁）
    this.groundTiles = [];
    this.season = session.time.date.season;

    this.physics.world.setBounds(0, 0, world.width * TILE, world.height * TILE);

    // 静态图块：实心格进物理组（提供碰撞体），其余为纯显示
    const solids = this.physics.add.staticGroup();
    this.environment = new FarmEnvironment(this);
    this.pond = new FarmWater(this, world);
    this.soilSurface = new FarmSoilSurface(this, world, this.housePlot !== null);
    this.atmosphere = new FarmAtmosphere(this);
    this.atmosphere.update(session.life.minute, session.weather.current().type, 0);
    for (let r = 0; r < world.height; r++) {
      for (let c = 0; c < world.width; c++) {
        const tile = world.tiles[r][c];
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        // P5-A：按格 + **当季**选纹理（变体取模公式与季节无关 → 换季不重排）
        const tex = tileTextureFor(tile.key, r, c, this.season);
        let img: Phaser.GameObjects.Image;
        if (tile.solid) {
          const s = solids.create(cx, cy, tex);
          if (!s) continue;
          img = s as Phaser.GameObjects.Image;
        } else {
          img = this.add.image(cx, cy, tex);
        }
        // P5-A：缓存地面图元，供换季统一 setTexture（不销毁、不重建、不动物理体）
        this.groundTiles.push({ img, key: tile.key, r, c });
        if (tile.key === "bed" && this.housePlot) img.setTexture("tile_soil");
        this.applyGroundSoilArt(img, tile.key);
        const verticalFence = tile.key === "fence" && (c === 0 || c === world.width - 1);
        if (this.environment.render(tile, r, c, verticalFence)) img.setVisible(false);
        if (this.pond.render(tile, r, c)) img.setVisible(false);
        else if (tile.key === "water") this.waterImages.push(img);
      }
    }

    this.environment.renderDetails(world, this.houseReserved);
    this.environment.applySeason(this.season);
    this.pond.applySeason(this.season);
    this.soilSurface.applySeason(this.season);
    if (this.housePlot) {
      const plot = this.housePlot;
      const texture = this.textures.get("farmhouse-main");
      if (!texture.has("trimmed")) texture.add("trimmed", 0, 44, 164, 1117, 1033);
      this.add.ellipse((plot.col + 2) * TILE, (plot.row + 1.8) * TILE, 148, 38, 0x26301a, 0.25).setDepth(2);
      this.add.image((plot.col + 2) * TILE, (plot.row + 2) * TILE, "farmhouse-main", "trimmed")
        .setOrigin(0.5, 1).setDisplaySize(160, 148).setDepth(FarmEnvironment.objectDepth((plot.row + 2) * TILE));
      const body = solids.create((plot.col + 2) * TILE, (plot.row + 1) * TILE, "tile_fence") as Phaser.Physics.Arcade.Image;
      body.setDisplaySize(4 * TILE, 2 * TILE).setVisible(false).refreshBody();
      if (this.textures.exists("farm-home-path")) {
        for (let r = plot.row + 2; r < plot.row + 4; r++) for (let c = plot.col + 1; c <= plot.col + 2; c++) {
          this.add.image(c * TILE, r * TILE, "farm-home-path", c === plot.col + 1 ? "w" : "e")
            .setOrigin(0).setDisplaySize(TILE, TILE).setDepth(1);
        }
      }
    }

    // T4-3：目标格高亮（单例矩形，初始隐藏；origin 左上，覆盖整格）
    this.tileHighlight = this.add
      .rectangle(0, 0, TILE - 2, TILE - 2, 0xfff28c, 0.10)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xfff28c, 0.9)
      .setDepth(6)
      .setVisible(false);

    // 玩家
    this.player = new Player(
      this,
      world.start.col * TILE + TILE / 2,
      world.start.row * TILE + TILE / 2,
    );
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncTargetHighlight, this);
    if (this.returningHome) {
      const door = this.housePlot ?? {
        doorX: world.bed.col * TILE + TILE / 2, doorY: (world.bed.row + 1) * TILE + TILE / 2,
      };
      this.player.sprite.body!.reset(door.doorX, door.doorY);
    }
    if (this.fromArea) {
      const arrival = arrivalFrom("farm", this.fromArea, world.width);
      if (arrival) this.player.sprite.body!.reset(arrival.x, arrival.y);
    }
    this.physics.add.collider(this.player.sprite, solids);
    this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    const merchantPlot = chooseMerchantPlot(world, Object.keys(session.farming.serialize()), this.houseReserved);
    if (merchantPlot) {
      if (this.textures.exists("farm-merchant-v1")) {
        const texture = this.textures.get("farm-merchant-v1");
        if (!texture.has("trimmed")) texture.add("trimmed", 0, 258, 216, 576, 1096);
      }
      this.merchant = new MerchantResident(this, merchantPlot);
      this.physics.add.collider(this.player.sprite, this.merchant.body);
      this.houseReserved.push(`${merchantPlot.row}_${merchantPlot.col}`);
    }

    // P1：水面双帧动画（600ms 切换水波高光；只 setTexture，不重建精灵/碰撞体）
    // P5-A：回调**实时读取** this.season → 换季不必重建定时器也能自动切到当季帧对
    if (this.waterImages.length > 0) {
      this.waterTimer = this.time.addEvent({
        delay: 600,
        loop: true,
        callback: () => {
          this.waterFrame = !this.waterFrame;
          const key = waterKey(this.season, this.waterFrame ? 1 : 0);
          for (const img of this.waterImages) img.setTexture(key);
        },
      });
    }

    // 摄像机
    const cam = this.cameras.main;
    cam.setBounds(0, 0, world.width * TILE, world.height * TILE);
    cam.startFollow(this.player.sprite, true, 0.1, 0.1);
    cam.setZoom(1).setRoundPixels(true);

    // Keep pixel borders at native size when the board expands.
    addWoodPanel(this, 8, 8, 204, 58, 99);

    // HUD：金币图标 + 文本（固定在屏幕上，不随摄像机滚动）
    const goldVisual = getItemVisual("gold", this.hasVisualFrame);
    this.add
      .image(24, 22, goldVisual.texture, goldVisual.frame)
      .setScrollFactor(0)
      .setDepth(100)
      .setDisplaySize(20, 20);
    this.hud = this.add
      .text(46, 12, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f3ead3",
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.lifeHud = this.add.text(18, 35, "", {
      fontFamily: "monospace", fontSize: "11px", color: "#f0dfb9",
    }).setScrollFactor(0).setDepth(100);
    this.add.rectangle(18, 56, 168, 3, 0x493c2a).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
    this.energyBar = this.add.rectangle(18, 56, 168, 3, 0x8da358)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
    // T4-3：右上角显示当前选中物品（P3：木质背板 + 图标 + 名称）
    addWoodPanel(this, this.scale.width - 162, 8, 154, 34, 99);
    this.selectedNameText = this.add
      .text(this.scale.width - 16, 13, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f3ead3",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    // P1：选中物品图标（16×16，随名称动态定位在文字左侧，不遮挡其它 HUD）
    this.selectedIcon = this.add
      .image(0, 14, "icon_empty")
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.refreshSelectedName();

    // P3：操作提示上移至快捷栏之上（快捷栏贴底，二者留 4px 间隙不叠压）
    this.add
      .text(12, this.scale.height - 52, "WASD 移动 · 左键/空格使用 · E 交互 · Q 任务 · B 集市 · I 背包 · M 声音", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#f0dfb9",
        backgroundColor: "#10181299",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    // P3：底部快捷栏（8 木质格 + 物品图标 + 选中态）
    this.buildHotbar();
    this.saveNotice = this.add.text(12, 70, "", {
      fontFamily: "monospace", fontSize: "11px", color: "#ffd4ba", backgroundColor: "#522b23",
    }).setScrollFactor(0).setDepth(108);
    this.menu = new FarmMenu(this, index => this.selectSlot(index));
    this.audioSettings = new AudioSettingsMenu(this);
    this.crafting = new CraftingMenu(this);
    this.travel = new TravelMenu(this);
    this.fishingSpot = null;
    this.fishingPanel = new FishingPanel(this);
    this.pondLife = new PondLife(this,world);
    this.dialogue = new MerchantDialogue(this, () => this.menu.open("market"),
      () => this.merchant?.near(this.player.x, this.player.y) ?? false, () => this.merchant === null);
    this.questHint = this.add.text(12, 86, "", {
      fontFamily: "monospace", fontSize: "10px", color: "#f2dfaa", backgroundColor: "#302e1cbb",
      padding: { x: 5, y: 4 }, wordWrap: { width: 224 },
    }).setScrollFactor(0).setDepth(107);
    this.contextHint = this.add.text(this.scale.width / 2, this.scale.height - 76, "", {
      fontFamily: "monospace", fontSize: "12px", color: "#f2dfaa", backgroundColor: "#302e1c",
      wordWrap: { width: this.scale.width - 36 }, align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(108);

    // 交互：床睡觉 / 回标题
    const k = this.input.keyboard!;
    k.on("keydown-E", () => this.onInteract());
    k.on("keydown-T", () => {
      if (this.busy()) return;
      if (this.saveCurrent()) this.scene.start(SCENE_TITLE);
    });
    k.on("keydown-B", () => { if (!this.busy()) this.menu.open("market"); });
    k.on("keydown-I", () => { if (!this.busy()) this.menu.open("inventory"); });
    k.on("keydown-Q", () => { if (!this.busy()) this.dialogue.open("journal"); });
    k.on("keydown-M", () => { if (!this.busy()) this.audioSettings.open(); });
    k.on("keydown-K", () => { if (!this.busy()) this.crafting.open(); });
    k.on("keydown-L", () => { if (!this.busy()) this.travel.open(); });
    k.on("keydown-F", (event: KeyboardEvent) => {
      if (event.repeat || this.busy() || document.hidden) return;
      const target=pondCastTarget(this.world,this.player);
      if (!target) {this.toast("走近农场池塘，在岸边按 F 下竿");return;}
      this.fishingSpot=target;this.fishingPanel.open();
    });

    // T4-3：数字键 1-8 → 快捷栏选择
    for (let i = 0; i < NUM_KEYS.length; i++) {
      k.on(`keydown-${NUM_KEYS[i]}`, () => this.selectSlot(i));
    }

    // T4-3：鼠标左键使用当前选中物品
    this.input.on("pointerdown", this.onPointerDown, this);
    this.detachToolShortcut = bindToolShortcut(k, () => !this.busy() && !document.hidden, () => this.onPointerDown());

    this.saveCurrent();

    this.lastGold = session.economy.goldValue;
    this.lastDay = session.time.date.day;
    this.updateHud();
    this.passage = new AreaPassage(this, "farm", world, this.player.sprite,
      () => this.saveCurrent(), () => { this.enteringHome = true; this.hideGuidance(); },
      () => this.toast("保存失败，仍留在农场；请稍后重试路口"), this.houseReserved);
    this.passage.syncCultivated(Object.keys(session.farming.serialize()));
  }

  private busy(): boolean {
    return this.enteringHome || !!(this.menu?.isOpen || this.dialogue?.isOpen || this.audioSettings?.isOpen || this.crafting?.isOpen || this.travel?.isOpen || this.fishingPanel?.isOpen);
  }

  private updateLantern(): void {
    const session = getGameSession();
    if (!session.exploration.state.lanternBuilt) return;
    if (!this.lantern && this.hasVisualFrame("farm-forage-v1", "farm_lantern")) {
      const x = (this.housePlot?.doorX ?? this.world.bed.col * TILE + 16) - 20;
      const y = (this.housePlot?.doorY ?? this.world.bed.row * TILE + 16) + 24;
      this.lanternGlow = this.add.ellipse(x, y - 16, 76, 66, 0xffce79, 1).setAlpha(0).setDepth(3);
      this.lantern = this.add.image(x, y, "farm-forage-v1", "farm_lantern").setOrigin(0.5, 1);
      this.lantern.setScale(46 / this.lantern.frame.realHeight).setDepth(FarmEnvironment.objectDepth(y));
    }
    this.lanternGlow?.setAlpha(session.life.minute >= 1080 ? 0.18 : 0);
  }

  // ── T4-3：切换快捷栏槽位 ──────────────────────
  private selectSlot(index: number): void {
    if (index !== this.selectedSlot) getFarmAudio().play("confirm");
    this.selectedSlot = index;
    this.moveHotbarSelection();
    this.refreshSelectedName();
  }

  // ── P3：构建底部快捷栏（8 木质格 + 物品图标 + 选中高亮）──
  private buildHotbar(): void {
    const scale = 2;
    const slot = 16 * scale;
    const gap = 4;
    const count = NUM_KEYS.length; // 8
    const totalW = count * slot + (count - 1) * gap;
    const startX = (this.scale.width - totalW) / 2 + slot / 2;
    const y = this.scale.height - 18; // 贴底，位于操作提示之上

    for (let i = 0; i < count; i++) {
      const x = startX + i * (slot + gap);
      const slotImg = this.add
        .image(x, y, "panel_slot")
        .setScrollFactor(0)
        .setDepth(98)
        .setScale(scale)
        .setOrigin(0.5);
      this.hotbarSlots.push(slotImg);
      const iconImg = this.add
        .image(x, y, "icon_empty")
        .setScrollFactor(0)
        .setDepth(101)
        .setScale(scale)
        .setOrigin(0.5);
      this.hotbarIcons.push(iconImg);
      this.add.text(x - 14, y - 14, String(i + 1), {
        fontFamily: "monospace", fontSize: "8px", color: "#ead8aa", stroke: "#443422", strokeThickness: 2,
      }).setScrollFactor(0).setDepth(102);
      this.hotbarCounts.push(this.add.text(x + 13, y + 13, "", {
        fontFamily: "monospace", fontSize: "10px", color: "#fff0c7", stroke: "#443422", strokeThickness: 2,
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(102));
    }

    // 选中高亮（单例，初始在 0 号格；depth 压最上但不挡游戏区）
    this.hotbarSelected = this.add
      .image(startX, y, "panel_slot_selected")
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(scale)
      .setOrigin(0.5);

    this.updateHotbar();
  }

  // ── P3：刷新快捷栏 8 格图标（按当前选中槽，随背包变化）──
  private updateHotbar(): void {
    const session = getGameSession();
    const hb = session.inventory.hotbar();
    const slots = session.inventory.serialize().slots;
    for (let i = 0; i < this.hotbarIcons.length; i++) {
      const itemId = hb[i];
      const visual = getItemVisual(itemId, this.hasVisualFrame);
      this.hotbarIcons[i].setTexture(visual.texture, visual.frame).setDisplaySize(24, 24)
        .setVisible(Boolean(itemId) && visual.texture !== "icon_empty");
      const amount = slots[i]?.amount ?? 0;
      this.hotbarCounts[i].setText(amount > 1 ? String(amount) : "");
    }
  }

  // ── P3：把选中高亮移到当前槽 ──
  private moveHotbarSelection(): void {
    if (this.hotbarSlots.length === 0) return;
    const target = this.hotbarSlots[this.selectedSlot];
    if (target) this.hotbarSelected.setPosition(target.x, target.y);
  }

  // ── T4-3：刷新右上角选中物品文本 + P1：同步图标 ──
  private refreshSelectedName(): void {
    const session = getGameSession();
    const hb = session.inventory.hotbar();
    const itemId = hb[this.selectedSlot];
    let text = "空";
    if (itemId) {
      const def = getItem(itemId);
      text = def ? def.name : itemId;
    }
    this.selectedNameText.setText(text);
    // 文字 origin(1,0) 右缘 = scale.width-12；图标置于文字左侧 6px
    const visual = getItemVisual(itemId, this.hasVisualFrame);
    this.selectedIcon.setTexture(visual.texture, visual.frame).setDisplaySize(16, 16)
      .setVisible(Boolean(itemId) && visual.texture !== "icon_empty");
    this.selectedIcon.setPosition(this.selectedNameText.x - this.selectedNameText.width - 6, 13);
  }

  // ── T4-3：目标格计算（含边界检查），越界返回 null ──
  private getTargetTileId():
    | { tileId: string; row: number; col: number; key: TileDef["key"] }
    | null {
    const t = computeTargetTile(this.player.x, this.player.y, this.player.facing, TILE);
    if (t.row < 0 || t.row >= this.world.height) return null;
    if (t.col < 0 || t.col >= this.world.width) return null;
    if (this.houseReserved.includes(tileIdOf(t.row, t.col))) return null;
    const def = this.world.tiles[t.row][t.col];
    return { tileId: tileIdOf(t.row, t.col), row: t.row, col: t.col, key: def.key };
  }

  // ── T4-3：鼠标左键 —— 按当前选中物品分发（结果如实提示，失败不伪装成功）──
  private onPointerDown(): void {
    if (this.busy()) return;
    const session = getGameSession();
    const itemId = session.inventory.hotbar()[this.selectedSlot];
    if (!itemId) return;
    if (itemId === "mushroom_meal") {
      const result = session.eatMeal();
      getFarmAudio().play(result.ok ? "confirm" : "error");
      this.toast(result.ok ? "吃好了，体力恢复" : result.reason === "ENERGY_FULL" ? "体力充足，留着稍后吃" : "吃饭未完成，请重试");
      return;
    }
    const target = this.getTargetTileId();
    if (!target) return;

    const def = getItem(itemId);
    if (!def) return;

    // 按农田实际状态判定（非静态地图 key），与领域层规则一致
    const snapTile = session.farming.serialize()[target.tileId];

    if (itemId === "hoe") {
      if (!TILLABLE.has(target.key)) return; // 地形限制保持（grass | soil）
      const r = session.actions.till(target.tileId);
      if (!r.ok) { getFarmAudio().play("error"); this.toast(r.reason === "TOO_TIRED" ? "体力不足，回小屋床边休息" : `开垦失败：${r.reason}`); }
      else { this.player.playAction("hoe"); if (!snapTile?.tilled) getFarmAudio().play("hoe"); this.saveCurrent(); }
      // 成功：靠 T4-3 开垦覆盖层视觉反馈，不打扰式 toast
    } else if (itemId === "watering_can") {
      if (!snapTile) {
        getFarmAudio().play("error");
        this.toast("请先开垦这块地");
        return;
      }
      const r = session.actions.water(target.tileId);
      if (!r.ok) {
        getFarmAudio().play("error");
        this.toast(r.reason === "TOO_TIRED" ? "体力不足，回小屋床边休息" : `浇水失败：${r.reason}`);
        return;
      }
      this.player.playAction("water");
      if (!snapTile.watered) getFarmAudio().play("water");
      this.toast(session.weather.current().autoWater ? "雨水已经浇湿了土地" : "浇水完成");
      this.saveCurrent();
    } else if (def.category === ItemCategory.Seed) {
      if (!snapTile) {
        getFarmAudio().play("error");
        this.toast("请先开垦这块地");
        return;
      }
      if (snapTile.crop) {
        getFarmAudio().play("error");
        this.toast("这里已经有作物了");
        return;
      }
      const r = session.actions.plant(target.tileId, itemId);
      if (!r.ok) {
        getFarmAudio().play("error");
        this.toast(r.reason === "TOO_TIRED" ? "体力不足，回小屋床边休息" : `播种失败：${r.reason}`);
        return;
      }
      this.player.playAction("plant");
      getFarmAudio().play("plant");
      this.toast("播种成功");
      this.saveCurrent();
    }
  }

  // ── T4-3：E 键 —— 优先收获成熟作物，否则回落 trySleep ──
  private onInteract(): void {
    if (this.busy()) return;
    const target = this.getTargetTileId();
    if (target) {
      const session = getGameSession();
      const snap = session.farming.serialize();
      const tile = snap[target.tileId];
      if (tile && tile.crop) {
        const def = session.crops.getDefinition(tile.crop.cropId);
        if (def && session.crops.stageOf(tile.crop, def) === "mature") {
          const r = session.actions.harvest(target.tileId);
          if (r.ok) {
            this.player.playAction("harvest");
            getFarmAudio().play("harvest");
            this.toast("收获成功");
            this.saveCurrent();
            return;
          }
          this.toast(`收获失败：${r.reason}`);
          getFarmAudio().play("error");
          return;
        }
      }
    }
    if (this.merchant?.near(this.player.x, this.player.y)) { getFarmAudio().play("confirm"); this.dialogue.open("talk"); return; }
    this.tryEnterHome();
  }

  // ── T4-3：作物阶段渲染（脏检查 + 精灵复用 + 移除孤儿）──
  private renderCropsIfChanged(): void {
    const session = getGameSession();
    const snap = session.farming.serialize();
    const key = JSON.stringify(snap);
    if (key === this.lastSnapshotKey) return;
    this.lastSnapshotKey = key;

    const next = new Set<string>();
    for (const [tileId, tile] of Object.entries(snap)) {
      if (!tile.crop) continue;
      const def = session.crops.getDefinition(tile.crop.cropId);
      if (!def) continue;

      const stage = session.crops.stageOf(tile.crop, def);
      const visual = getCropVisual(tile.crop.cropId, stage, this.hasVisualFrame);

      const parts = tileId.split("_");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      const x = c * TILE + TILE / 2;
      const y = (r + 1) * TILE;

      next.add(tileId);
      const img = this.cropSprites.get(tileId) ?? this.add.image(x, y, visual.texture, visual.frame).setDepth(5);
      img.setTexture(visual.texture, visual.frame).setOrigin(visual.originX, visual.originY)
        .setDisplaySize(visual.width, visual.height).setPosition(x, y);
      this.cropSprites.set(tileId, img);
    }

    for (const [tileId, img] of this.cropSprites) {
      if (!next.has(tileId)) {
        img.destroy();
        this.cropSprites.delete(tileId);
      }
    }
  }

  // ── T4-3：开垦视觉层（已开垦草地格叠加耕地纹理；脏检查 + 精灵复用）──
  private renderTilledIfChanged(): void {
    const session = getGameSession();
    const snap = session.farming.serialize();
    const key = JSON.stringify(snap);
    if (key === this.lastTilledKey) return;
    this.lastTilledKey = key;
    this.environment.setCultivated([...Object.keys(snap), ...this.houseReserved]);
    this.passage?.syncCultivated(Object.keys(snap));
    if (this.soilSurface.ready) { this.soilSurface.update(snap); return; }

    const next = new Set<string>();
    for (const [tileId, tile] of Object.entries(snap)) {
      const parts = tileId.split("_");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      // 干湿覆盖适用于草地及原有农田；地图和农田状态不变
      const mapTile = this.world.tiles[r]?.[c];
      if (!mapTile || !TILLABLE.has(mapTile.key)) continue;

      next.add(tileId);
      const x = c * TILE + TILE / 2;
      const y = r * TILE + TILE / 2;
      const visual = getSoilVisual(tile.watered, this.hasVisualFrame);
      const img = this.tilledSprites.get(tileId) ?? this.add.image(x, y, visual.texture, visual.frame).setDepth(4);
      img.setTexture(visual.texture, visual.frame).setOrigin(visual.originX, visual.originY)
        .setDisplaySize(visual.width, visual.height).setPosition(x, y);
      this.tilledSprites.set(tileId, img);
    }

    for (const [tileId, img] of this.tilledSprites) {
      if (!next.has(tileId)) {
        img.destroy();
        this.tilledSprites.delete(tileId);
      }
    }
  }

  // ── P5-A：换季刷新 ─────────────────────────────
  // 只对地面图元调用 setTexture：
  //   · 不重建 GameSession / 不重置玩家位置 / 不动 physics.world 与 camera
  //   · 不销毁也不重建水波定时器（回调实时读 this.season）
  //   · 所有季节变体尺寸恒为 32×32 → StaticBody 无需 refreshBody()
  private applySeason(season: Season): void {
    for (const t of this.groundTiles) {
      const tex =
        t.key === "bed" && this.housePlot ? "tile_soil" : t.key === "water"
          ? waterKey(season, this.waterFrame ? 1 : 0)
          : tileTextureFor(t.key, t.r, t.c, season);
      if (t.img.texture.key !== tex) t.img.setTexture(tex);
      this.applyGroundSoilArt(t.img, t.key);
    }
    this.season = season;
    this.environment.applySeason(season);
    this.pond.applySeason(season);
    this.soilSurface.applySeason(season);
  }

  private readonly hasVisualFrame = (texture: string, frame?: string): boolean =>
    this.textures.exists(texture) && (frame === undefined || this.textures.get(texture).has(frame));

  private applyGroundSoilArt(img: Phaser.GameObjects.Image, key: TileDef["key"]): void {
    if (this.soilSurface.ready) return;
    if ((key === "soil" || (key === "bed" && this.housePlot)) && this.hasVisualFrame("farm-soil-v1", "dry")) {
      img.setTexture("farm-soil-v1", "dry").setDisplaySize(TILE, TILE);
    }
  }
  private nearHome(): boolean {
    const door = this.housePlot ?? {
      doorX: this.world.bed.col * TILE + TILE / 2, doorY: this.world.bed.row * TILE + TILE / 2,
    };
    return Math.abs(this.player.x - door.doorX) <= 40 && Math.abs(this.player.y - door.doorY) <= 40;
  }

  private tryEnterHome(): void {
    if (this.enteringHome || !this.nearHome() || !this.saveCurrent()) return;
    this.enteringHome = true;
    getFarmAudio().play("door");
    this.scene.start("home");
  }

  private toast(text: string): void {
    this.notice.show(text);
  }

  private updateHud(): void {
    const session = getGameSession();
    const d = session.time.date;
    const g = session.economy.goldValue;
    const weather = { sunny: "晴", cloudy: "阴", rain: "雨" }[session.weather.current().type];
    this.hud.setText(`${SEASON_LABEL[d.season]} · ${d.day}日　${g} 金 · ${weather}`).setScale(1);
    if (this.hud.width > 154) this.hud.setScale(154 / this.hud.width);
    this.lifeHud.setText(`${session.life.clockText}　体力 ${session.life.energy}/100`);
    this.energyBar.setDisplaySize(168 * session.life.energy / 100, 3)
      .setFillStyle(session.life.energy < 20 ? 0xd9914f : 0x8da358);
  }

  private saveCurrent(): boolean {
    const saved = getGameSession().saveGame();
    if (!saved) getFarmAudio().play("error");
    this.saveNotice?.setText(saved ? "" : "保存失败，请勿关闭页面；检查浏览器存储空间");
    return saved;
  }

  private hideGuidance(): void {
    this.notice.update(0, true);
    this.merchant?.hideGuidance(); this.questHint?.setVisible(false);
    this.contextHint?.setVisible(false); this.tileHighlight?.setVisible(false);
  }

  update(_time: number, delta: number): void {
    this.fishingPanel?.update(delta);
    this.pondLife?.cast(this.player, this.fishingPanel?.isOpen ? this.fishingSpot : null, getGameSession().fishing.state.phase);
    const audio = getFarmAudio();
    if (this.busy() || document.hidden) {
      this.hideGuidance();
      audio.setPaused(true);
      this.clockPaused = true; this.player.sprite.setVelocity(0, 0); return;
    }
    const clockDelta = this.clockPaused ? 0 : delta;
    this.clockPaused = false;
    const session = getGameSession();
    audio.setEnvironment("farm", session.weather.current().type, session.life.minute);
    audio.setPaused(false);
    if (session.advanceTime(clockDelta)) this.saveCurrent();
    this.atmosphere.update(session.life.minute, session.weather.current().type, clockDelta);
    this.updateLantern();
    this.pondLife.update(clockDelta,session.time.date.season,session.life.minute,session.weather.current().type);
    this.player.update(delta);
    if (Math.hypot(this.player.x - this.lastStepX, this.player.y - this.lastStepY) >= 8) {
      audio.play("step"); this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    }
    const guidance = getQuestGuidance(session, "farm");
    this.merchant?.update(this.player.x, this.player.y, guidance.status, clockDelta);
    this.questHint.setVisible(true); this.contextHint.setVisible(true);
    const questKey = JSON.stringify(guidance);
    if (questKey !== this.lastQuestKey) {
      this.lastQuestKey = questKey;
      const nextStep = this.merchant ? guidance.nextStep : guidance.status === "available"
        ? "Q 打开禾木的便笺，领取种子" : guidance.status === "ready"
        ? "材料齐了 · Q 打开便笺核对交付" : "照料并收获委托作物 · Q 查看便笺";
      this.questHint.setText(guidance.status === "completed" ? "✓ 首份收成已完成 · L 区域手记"
        : `${guidance.title} · Q 手记\n${guidance.progress}\n${nextStep}`);
    }
    const context = this.merchant?.near(this.player.x, this.player.y) ? "E 与禾木交谈 · 种子与首份收成"
      : this.nearHome() ? "E 进入农舍 · 屋内床边休息"
      : session.life.isLate ? "夜深了 · 回小屋床边按 E 休息"
      : session.life.energy < 2 ? "体力不足 · 回小屋休息，明天再继续"
      : session.weather.current().autoWater ? "雨天自动浇水 · 省下体力照料农场"
      : pondCastTarget(this.world,this.player) ? "F 池畔垂钓 · 岸边备有鱼竿 · 成功消耗4体力"
      : this.passage?.hint() ?? "东南池塘可按 F 垂钓 · 西路通森林 · 东路通镇子";
    const notice = this.notice.update(clockDelta, false);
    this.contextHint.setText(notice || context).setColor(notice ? "#f5d693" : "#f2dfaa");
    this.player.sprite.setDepth(FarmEnvironment.objectDepth(this.player.y + TILE / 2));

    const lifeKey = `${session.life.minute}:${session.life.energy}:${session.weather.current().type}`;
    // Only rebuild HUD when displayed values change.
    if (session.economy.goldValue !== this.lastGold || session.time.date.day !== this.lastDay || lifeKey !== this.lastLifeKey) {
      this.lastGold = session.economy.goldValue;
      this.lastDay = session.time.date.day;
      this.lastLifeKey = lifeKey;
      this.updateHud();
    }

    // ── P5-A：季节脏检查（1 次字符串比较/帧；仅变化时重贴纹理）──
    const season = session.time.date.season;
    if (season !== this.season) this.applySeason(season);

    // T4-3：更新目标格高亮（越界隐藏）
    this.syncTargetHighlight();

    // T4-3：开垦视觉层 + 作物阶段渲染（均脏检查 + 精灵复用）
    this.renderTilledIfChanged();
    this.renderCropsIfChanged();

    // P3：快捷栏图标随背包变化刷新（脏检查，避免每帧 setTexture）
    this.refreshHotbarIfChanged();
    this.passage?.update();
  }

  // ── P3：快捷栏图标脏检查（8 格 itemId 串变化时逐格 setTexture）──
  private syncTargetHighlight(): void {
    const target = this.getTargetTileId();
    const active = !this.busy() && !document.hidden;
    if (target && active && TILLABLE.has(target.key)) {
      // Keep the 2px stroke wholly inside its 32px cell, after Arcade has synced the final position.
      this.tileHighlight.setPosition(target.col * TILE + 1, target.row * TILE + 1).setVisible(true);
    } else this.tileHighlight.setVisible(false);
  }

  private refreshHotbarIfChanged(): void {
    const session = getGameSession();
    const key = JSON.stringify(session.inventory.serialize().slots.slice(0, 8));
    if (key === this.lastHotbarKey) return;
    this.lastHotbarKey = key;
    this.updateHotbar();
    this.refreshSelectedName();
  }

  // ── T4-3：场景关闭时清理新增监听与精灵缓存 ────
  shutdown(): void {
    this.detachToolShortcut?.(); this.detachToolShortcut = undefined;
    this.notice.clear();
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncTargetHighlight, this);
    this.menu?.destroy();
    this.crafting?.destroy();
    this.travel?.destroy();
    this.fishingPanel?.destroy();this.fishingSpot=null;
    this.pondLife?.destroy();
    this.passage?.destroy(); this.passage = undefined;
    this.lantern?.destroy(); this.lantern = undefined;
    this.lanternGlow?.destroy(); this.lanternGlow = undefined;
    this.audioSettings?.destroy();
    getFarmAudio().setPaused(true);
    this.dialogue?.destroy();
    this.merchant?.destroy();
    this.merchant = null;
    this.pond?.destroy();
    this.soilSurface?.destroy();
    this.atmosphere?.destroy();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.player?.destroy();
    const k = this.input.keyboard;
    if (k) {
      for (const event of ["keydown-E", "keydown-T", "keydown-B", "keydown-I", "keydown-Q", "keydown-M", "keydown-K", "keydown-L", "keydown-F"]) k.off(event);
      for (const n of NUM_KEYS) {
        k.off(`keydown-${n}`);
      }
    }
    this.input.off("pointerdown", this.onPointerDown, this);

    for (const img of this.cropSprites.values()) {
      img.destroy();
    }
    this.cropSprites.clear();
    this.lastSnapshotKey = "";
    for (const img of this.tilledSprites.values()) {
      img.destroy();
    }
    this.tilledSprites.clear();
    this.lastTilledKey = "";

    // P1：停止水波定时器并清空水面精灵缓存（防场景重进叠加）
    this.waterTimer?.destroy();
    this.waterTimer = undefined;
    this.waterImages = [];
    this.waterFrame = false;

    // P3：销毁快捷栏精灵（木质格 + 物品图标 + 选中态），清空数组与脏检查键
    for (const img of this.hotbarSlots) img.destroy();
    this.hotbarSlots = [];
    for (const img of this.hotbarIcons) img.destroy();
    this.hotbarIcons = [];
    for (const count of this.hotbarCounts) count.destroy();
    this.hotbarCounts = [];
    this.hotbarSelected?.destroy();
    this.lastHotbarKey = "";

    // P5-A：清空地面图元缓存与季节状态（显示对象由场景显示列表统一回收）
    this.groundTiles = [];
    this.season = "spring";
  }
}
