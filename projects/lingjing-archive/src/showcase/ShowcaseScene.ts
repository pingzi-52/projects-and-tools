import Phaser from "phaser";

const TILE = 32;
const COLS = 16;
const ROWS = 12;
const ASSETS = {
  grass_1: "grass", grass_2: "grass", grass_3: "grass",
  grass_flowers_white: "grass",
  dirt_1: "path", dirt_2: "path",
  water_1: "water", water_edge_n: "water", water_edge_s: "water",
  water_edge_e: "water", water_edge_w: "water",
  tree_oak: "trees", tree_apple: "trees", rock: "rock",
  bush: "flowers", berry_bush: "flowers",
  flower_blue: "flowers", flower_pink: "flowers", flower_yellow: "flowers",
  fence_horizontal: "fence", fence_vertical: "fence", fence_post: "fence",
  fence_end_left: "fence", fence_end_right: "fence", gate_open: "fence",
} as const;
type Asset = keyof typeof ASSETS;
type Placement = readonly [Asset, number, number];

// Presentation only: no farm tile IDs, session state, physics or persistence.
const OBJECTS: readonly Placement[] = [
  ["tree_oak", 1, 1], ["tree_oak", 3, 1], ["tree_apple", 2, 3],
  ["bush", 0, 2], ["bush", 1, 3], ["rock", 4, 2],
  ["flower_blue", 4, 4], ["flower_yellow", 5, 3],
  ["tree_oak", 8, 1], ["bush", 9, 2], ["flower_pink", 9, 4],
  ["tree_apple", 14, 7], ["bush", 15, 8], ["rock", 13, 8],
  ["flower_blue", 11, 7], ["flower_yellow", 12, 9],
  ["tree_oak", 1, 10], ["bush", 2, 9], ["rock", 0, 8],
  ["flower_pink", 5, 10], ["berry_bush", 4, 9],
  ["fence_post", 2, 7], ["fence_horizontal", 3, 7],
  ["fence_horizontal", 4, 7], ["fence_end_right", 5, 7],
  ["gate_open", 6, 7], ["fence_end_left", 7, 7],
  ["fence_horizontal", 8, 7], ["fence_post", 9, 7],
  ["fence_vertical", 2, 8], ["fence_vertical", 9, 8],
  ["flower_yellow", 8, 10], ["bush", 10, 11],
];

export class ShowcaseScene extends Phaser.Scene {
  constructor() { super("showcase"); }

  preload(): void {
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      const status = document.getElementById("sample-status");
      if (status) status.textContent = `素材加载失败：${file.key}`;
    });
    for (const [key, folder] of Object.entries(ASSETS)) {
      this.load.image(key, `${import.meta.env.BASE_URL}farm-assets/${folder}/${key}.png`);
    }
  }

  create(): void {
    if (Object.keys(ASSETS).some(key => !this.textures.exists(key))) return;
    this.cameras.main.setZoom(1).setBackgroundColor("#537b36");

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) this.place("grass_1", col, row);
    }
    // Grouped variations: avoid a random checkerboard of different grass shades.
    const patches: readonly Placement[] = [
      ["grass_2", 0, 0], ["grass_2", 1, 0], ["grass_2", 0, 1],
      ["grass_3", 2, 2], ["grass_3", 3, 2],
      ["grass_flowers_white", 4, 3], ["grass_flowers_white", 5, 4],
      ["grass_flowers_white", 12, 7], ["grass_flowers_white", 11, 8],
      ["grass_2", 14, 9], ["grass_2", 15, 9], ["grass_2", 15, 10],
    ];
    for (const [key, col, row] of patches) this.place(key, col, row, 1);

    // Two-cell-wide dirt route connecting the woodland, pond and fence entrance.
    for (let col = 3; col <= 12; col++) {
      this.place("dirt_1", col, 5, 2);
      this.place("dirt_1", col, 6, 2);
    }
    for (let row = 4; row < ROWS; row++) {
      this.place("dirt_1", 6, row, 2);
      this.place("dirt_1", 7, row, 2);
    }
    this.place("dirt_2", 5, 5, 3);
    this.place("dirt_2", 10, 6, 3);

    // The pack has four shore edges but no dedicated corner tiles.
    // Corners combine cropped pieces of those original edges; no new PNGs.
    for (let row = 1; row <= 4; row++) {
      for (let col = 11; col <= 14; col++) this.place("water_1", col, row, 4);
    }
    for (let col = 12; col <= 13; col++) {
      this.place("water_edge_n", col, 1, 5);
      this.place("water_edge_s", col, 4, 5);
    }
    for (let row = 2; row <= 3; row++) {
      this.place("water_edge_w", 11, row, 5);
      this.place("water_edge_e", 14, row, 5);
    }
    this.corner(11, 1, "water_edge_w", "water_edge_n", true);
    this.corner(14, 1, "water_edge_e", "water_edge_n", false);
    this.corner(11, 4, "water_edge_w", "water_edge_s", true);
    this.corner(14, 4, "water_edge_e", "water_edge_s", false);

    for (const [key, col, row] of OBJECTS) this.place(key, col, row, 10 + row);
    const status = document.getElementById("sample-status");
    if (status) status.textContent = "16 × 12 格 · 原生 16px 素材按 2× 显示 · 春季样板";
  }

  private corner(col: number, row: number, side: Asset, cap: Asset, left: boolean): void {
    this.place(side, col, row, 5);
    this.place(cap, col, row, 6).setCrop(left ? 8 : 0, 0, 8, 16);
  }

  private place(key: Asset, col: number, row: number, depth = 0): Phaser.GameObjects.Image {
    return this.add.image(col * TILE, row * TILE, key)
      .setOrigin(0, 0).setScale(2).setDepth(depth);
  }
}
