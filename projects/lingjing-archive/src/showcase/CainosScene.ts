import Phaser from "phaser";

const TILE = 32;
const SHEETS = ["TX Plant", "TX Shadow Plant", "TX Props", "TX Tileset Grass"] as const;

/** Native PNG style test. No game session, saved tiles, farming or physics. */
export class CainosScene extends Phaser.Scene {
  constructor(private readonly fullSample = false) {
    super(fullSample ? "cainos-farm-sample" : "cainos-review");
  }

  preload(): void {
    this.load.on("loaderror", (file: Phaser.Loader.File) => this.status(`素材加载失败：${file.key}`));
    for (const sheet of SHEETS) {
      const base = `${import.meta.env.BASE_URL}farm-assets/cainos-basic/`;
      this.load.atlas(sheet, `${base}${sheet}.png`, `${base}${sheet}.json`);
    }
    if (this.fullSample) {
      const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v1/`;
      this.load.image("pond-addon", `${base}pond-v1.png`);
      this.load.atlas("dirt-addon", `${base}dirt-road-v1.png`, `${base}dirt-road-v1.json`);
      this.load.atlas("fence-addon", `${base}wood-fence-v1.png`, `${base}wood-fence-v1.json`);
    }
  }

  create(): void {
    const required: readonly string[] = this.fullSample
      ? [...SHEETS, "pond-addon", "dirt-addon", "fence-addon"] : SHEETS;
    if (required.some(sheet => !this.textures.exists(sheet))) return;
    document.title = "灵镜档案 · Cainos 免费素材验证";
    const heading = document.querySelector("h1");
    if (heading) heading.textContent = "灵镜档案 · 林缘石径";
    this.cameras.main.setZoom(1).setRoundPixels(true);

    // Combine the author's separate lower/upper tree frames without changing PNGs.
    const plants = this.textures.get("TX Plant");
    for (const type of ["T1", "T2", "T3"]) {
      const upper = plants.get(`TX Tree ${type} Upper`);
      const lower = plants.get(`TX Tree ${type} Lower`);
      plants.add(`tree-${type}`, 0, upper.cutX, upper.cutY, upper.cutWidth,
        lower.cutY + lower.cutHeight - upper.cutY);
    }

    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 16; col++) {
        const variant = (row * 13 + col * 7) % 3;
        this.add.image(col * TILE, row * TILE, "TX Tileset Grass", `TX Tileset Grass ${variant}`)
          .setOrigin(0).setDepth(0);
      }
    }
    if (this.fullSample) {
      this.createFarmSample();
      return;
    }
    // The free pack supplies stone paving; no dirt road or water is substituted.
    for (let row = 2; row < 12; row++) {
      for (let side = 0; side < 2; side++) {
        const frame = ((row - 2) % 2) * 2 + side;
        this.add.image((7 + side) * TILE, row * TILE, "TX Tileset Grass",
          `TX Tileset Grass Pavement ${frame}`).setOrigin(0).setDepth(1);
      }
    }
    const flowers = [[5, 6], [6, 7], [5, 8], [10, 5], [11, 6], [11, 7], [10, 8]];
    flowers.forEach(([col, row], index) => {
      this.add.image(col * TILE, row * TILE, "TX Tileset Grass",
        `TX Tileset Grass Flower ${index}`).setOrigin(0).setDepth(1);
    });

    this.tree("T3", 81, 157);
    this.tree("T2", 177, 140);
    this.tree("T1", 432, 156);
    this.tree("T3", 459, 299);
    this.tree("T2", 74, 372);

    const bushes: readonly [number, number, number][] = [
      [4, 38, 206], [2, 153, 182], [3, 199, 236], [6, 360, 182],
      [1, 381, 222], [4, 374, 325], [2, 129, 350], [5, 29, 285],
    ];
    for (const [type, x, y] of bushes) {
      this.add.image(x + 2, y + 5, "TX Shadow Plant", `TX Shadow Bush T${type}`)
        .setOrigin(0.5, 1).setAlpha(0.4).setDepth(2);
      this.add.image(x, y, "TX Plant", `TX Bush T${type}`).setOrigin(0.5, 1).setDepth(y);
    }
    for (const [frame, x, y] of [
      ["TX Props Stone T7", 155, 270], ["TX Props - Stone 06", 347, 236],
      ["TX Props - Stone 03", 193, 317], ["TX Props Barrel", 333, 105],
      ["TX Props Crate Small", 363, 109],
    ] as const) {
      this.add.image(x, y, "TX Props", frame).setOrigin(0.5, 1).setDepth(y);
    }
    for (const [x, y, type] of [
      [40, 225, "04"], [163, 195, "05"], [189, 250, "10"],
      [329, 216, "11"], [371, 267, "02"], [149, 367, "12"],
      [333, 348, "14"], [201, 104, "07"],
    ] as const) {
      this.add.image(x, y, "TX Plant", `TX Plant - Grass ${type}`)
        .setOrigin(0.5, 1).setDepth(y);
    }
    this.status("免费 Basic 原图 · 32px 网格 / 1× · 树、草与石径验证");
    const root = document.getElementById("game-root");
    if (root) root.dataset.preview = "cainos-basic";
  }

  private createFarmSample(): void {
    document.title = "灵镜档案 · 林缘农场样板";
    const heading = document.querySelector("h1");
    if (heading) heading.textContent = "灵镜档案 · 林缘农场";

    const road = new Set<string>();
    const rectangle = (left: number, top: number, width: number, height: number) => {
      for (let row = top; row < top + height; row++) {
        for (let col = left; col < left + width; col++) road.add(`${col},${row}`);
      }
    };
    rectangle(6, 7, 2, 5);
    rectangle(6, 7, 5, 2);
    rectangle(9, 4, 2, 5);
    const has = (col: number, row: number) => road.has(`${col},${row}`);
    for (const cell of road) {
      const [col, row] = cell.split(",").map(Number);
      const n = has(col, row - 1), e = has(col + 1, row);
      const s = has(col, row + 1), w = has(col - 1, row);
      const frame = !n && !w ? "nw" : !n && !e ? "ne" : !s && !w ? "sw"
        : !s && !e ? "se" : !n ? "n" : !s ? "s" : !w ? "w" : !e ? "e" : "center";
      this.add.image(col * TILE, row * TILE, "dirt-addon", frame)
        .setOrigin(0).setDisplaySize(TILE, TILE).setDepth(1);
    }
    this.add.image(422, 155, "pond-addon").setDisplaySize(164, 164).setDepth(3);

    for (const [col, row, frame] of [
      [3, 7, 8], [4, 7, 9], [5, 7, 10], [3, 8, 12], [4, 8, 13], [5, 8, 14],
      [3, 9, 8], [4, 9, 9], [5, 9, 10], [11, 8, 11], [12, 8, 15],
      [11, 9, 13], [10, 10, 12], [2, 6, 4], [5, 5, 6],
    ]) {
      this.add.image(col * TILE, row * TILE, "TX Tileset Grass", `TX Tileset Grass Flower ${frame}`)
        .setOrigin(0).setDepth(1);
    }

    this.tree("T3", 70, 154);
    this.tree("T2", 177, 148);
    this.tree("T1", 315, 132);
    this.tree("T2", 58, 378);
    this.tree("T3", 443, 376);
    for (const [type, x, y] of [
      [4, 28, 205], [2, 159, 190], [3, 203, 227], [6, 282, 174],
      [1, 493, 255], [4, 377, 303], [2, 126, 346], [5, 24, 277],
    ]) {
      this.add.image(x + 2, y + 5, "TX Shadow Plant", `TX Shadow Bush T${type}`)
        .setOrigin(0.5, 1).setAlpha(0.4).setDepth(2);
      this.add.image(x, y, "TX Plant", `TX Bush T${type}`).setOrigin(0.5, 1).setDepth(y);
    }
    for (const [frame, x, y] of [
      ["TX Props Stone T7", 144, 211], ["TX Props - Stone 06", 369, 276],
      ["TX Props - Stone 03", 283, 336], ["TX Props Barrel", 97, 222],
      ["TX Props Crate Small", 127, 222],
    ] as const) {
      this.add.image(x, y, "TX Props", frame).setOrigin(0.5, 1).setDepth(y);
    }
    for (const [x, y, type] of [
      [46, 222, "01"], [186, 192, "03"], [200, 244, "06"], [280, 158, "07"],
      [334, 255, "10"], [367, 328, "12"], [145, 366, "14"], [501, 233, "09"],
    ] as const) {
      this.add.image(x, y, "TX Plant", `TX Plant - Grass ${type}`)
        .setOrigin(0.5, 1).setDepth(y);
    }

    // Original companion sprites are a visual prototype, not final autotile art.
    for (let x = 112; x <= 176; x += 32) this.fence("horizontal", x, 316, 32, 20);
    this.fence("gate-closed", 224, 321, 64, 28);
    for (let x = 272; x <= 336; x += 32) this.fence("horizontal", x, 316, 32, 20);
    for (const y of [250, 282, 314]) this.fence("vertical", 96, y, 8, 32);
    this.fence("post", 96, 318, 9, 24);
    this.fence("post", 352, 318, 9, 24);

    this.status("16×12 样板 · Cainos 原图 + 原创生成补件 · 仅视觉验证");
    const root = document.getElementById("game-root");
    if (root) root.dataset.preview = "cainos-farm";
  }

  private fence(frame: string, x: number, y: number, width: number, height: number): void {
    this.add.image(x, y, "fence-addon", frame).setOrigin(0.5, 1)
      .setDisplaySize(width, height).setDepth(y);
  }

  private tree(type: string, x: number, y: number): void {
    const offset = type === "T3" ? 10 : 6;
    this.add.image(x + offset, y, "TX Shadow Plant", `TX Shadow Tree ${type}`)
      .setOrigin(0.5, 1).setAlpha(0.4).setDepth(2);
    this.add.image(x, y, "TX Plant", `tree-${type}`).setOrigin(0.5, 1).setDepth(y);
  }

  private status(text: string): void {
    const element = document.getElementById("sample-status");
    if (element) element.textContent = text;
  }
}
