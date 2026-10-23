import type Phaser from "phaser";
import { TILE } from "../config";
import type { Season } from "../../domain/models/types";

/**
 * 程序化像素占位素材（⚠️ 占位标记）
 * 所有纹理在运行时用 Canvas2D 绘制生成，无外部资源。
 * P0 美术统一：共享色板 + 1px 描边 + 柔和投影 + 三阶明暗 + 像素密度规范。
 * 后续替换为正式美术时，删除本模块并改用图集加载即可。
 */

// ── P0：统一暖色像素色板 ─────────────────────────
const P = {
  grassLight: "#7fae4f",
  grassMid: "#6d9c43",
  grassDark: "#557f34",
  grassEdge: "#446a27",
  dirtLight: "#ab8258",
  dirtMid: "#8f6741",
  dirtDark: "#6f4f2d",
  dirtEdge: "#553c22",
  woodLight: "#a97145",
  woodMid: "#8b5a33",
  woodDark: "#6a4123",
  leafLight: "#7fb854",
  leafMid: "#5d9a3f",
  leafDark: "#46782e",
  leafEdge: "#345c22",
  rockLight: "#b8bfc4",
  rockMid: "#98a0a7",
  rockDark: "#767e86",
  rockEdge: "#565d64",
  waterLight: "#63a8d8",
  waterMid: "#4a8fc0",
  waterDark: "#3a74a4",
  waterEdge: "#2d5c84",
  skin: "#f0c8a0",
  skinEdge: "#c79a6e",
  cream: "#e8d3b0",
  // P3：HUD 木质面板（比围栏木色更深，16-bit 暖像素风）
  panelDark: "#4a3018",
  panelMid: "#5c3d22",
  panelLight: "#7a5230",
  panelEdge: "#3a2a1a",
  panelGold: "#d9a441",
  gold: "#f5c542",
  goldLight: "#ffdf7e",
  goldDark: "#c79a26",
  white: "#f3f7f9",
  whiteShade: "#dde5ea",
  blanket: "#d98f6a",
  blanketLight: "#e8ab88",
  shadow: "rgba(20, 30, 15, 0.25)",
  outline: "#3a2a1a",
} as const;

// ── P5-A：四季环境色阶 ─────────────────────────────
// 核心层 P 恒定不变（木/石/面板/金/肤 → 保证全局视觉语言统一），
// 只有下列"环境层"随季节整体替换：草地 / 草叶 / 点缀 / 水面 / 树冠。
interface SeasonRamp {
  /** 草地 4 阶：亮 / 中 / 暗 / 缘 */
  gLight: string; gMid: string; gDark: string; gEdge: string;
  /** 草叶簇 2 阶（比草地基底更高对比，保证 2px 细节可读） */
  tLight: string; tDark: string;
  /** 季节点缀：夏三叶草 / 秋落叶 / 冬积雪；aAlt 为副色与暗边 */
  aMain: string; aAlt: string;
  /** 水面 4 阶 */
  wLight: string; wMid: string; wDark: string; wEdge: string;
  /** 树冠 4 阶 */
  lLight: string; lMid: string; lDark: string; lEdge: string;
}

const SEASON_RAMP: Record<Season, SeasonRamp> = {
  // 春：逐值与既有 P 相同 → tile_grass 色相/明度零回归
  spring: {
    gLight: "#7fae4f", gMid: "#6d9c43", gDark: "#557f34", gEdge: "#446a27",
    tLight: "#7fb854", tDark: "#46782e",
    aMain: "#f3f7f9", aAlt: "#ffdf7e",
    wLight: "#63a8d8", wMid: "#4a8fc0", wDark: "#3a74a4", wEdge: "#2d5c84",
    lLight: "#7fb854", lMid: "#5d9a3f", lDark: "#46782e", lEdge: "#345c22",
  },
  // 夏：降明度、提饱和、加对比（更浓密茂盛）
  summer: {
    gLight: "#7cb83f", gMid: "#649b32", gDark: "#4a7824", gEdge: "#38601b",
    tLight: "#8fc94a", tDark: "#3c6b1c",
    aMain: "#6d9c43", aAlt: "#8fc94a",
    wLight: "#6fc0e8", wMid: "#3f96cc", wDark: "#2f78ad", wEdge: "#245f8c",
    lLight: "#8dc94e", lMid: "#5f9c36", lDark: "#427a26", lEdge: "#2f5c1a",
  },
  // 秋：黄绿化 + 暖橙点缀（落叶）
  autumn: {
    gLight: "#a8ac52", gMid: "#8d9040", gDark: "#6d7130", gEdge: "#545826",
    tLight: "#b5b95c", tDark: "#5c6026",
    aMain: "#d97a2e", aAlt: "#b8452f",
    wLight: "#7fb0b8", wMid: "#5d8f9c", wDark: "#47737f", wEdge: "#355a66",
    lLight: "#d9a441", lMid: "#c07a2a", lDark: "#924f1c", lEdge: "#6d3a14",
  },
  // 冬：去饱和蓝绿 + 积雪（雪面用 aMain，霜边用 aAlt）
  winter: {
    gLight: "#92a389", gMid: "#7b8c72", gDark: "#616f59", gEdge: "#4a5743",
    tLight: "#a3b39a", tDark: "#4f5c48",
    aMain: "#f3f7f9", aAlt: "#dde5ea",
    wLight: "#a8c8d8", wMid: "#86aabc", wDark: "#6a8c9c", wEdge: "#52707f",
    lLight: "#93a58a", lMid: "#6f8070", lDark: "#55654f", lEdge: "#3f4d3c",
  },
};

/** 树冠绘制所需的 4 阶色（SeasonRamp 的子集，也可由专用调色板提供） */
type CanopyRamp = Pick<SeasonRamp, "lLight" | "lMid" | "lDark" | "lEdge">;

/** 冬季针叶树专用绿（避免针叶树被冬季去饱和 ramp 拉成石头色） */
const PINE: CanopyRamp = {
  lLight: "#6f8f5e",
  lMid: "#55744a",
  lDark: "#3f5a38",
  lEdge: "#2f4529",
};

/** 春花树专用粉（树种 1 春季，不随季节 ramp） */
const BLOSSOM: CanopyRamp = {
  lLight: "#f3d1dc",
  lMid: "#e8a4b8",
  lDark: "#c77d95",
  lEdge: "#3a2a1a",
};

/** 夏季荷花（水面点缀，与树冠调色板无关） */
const LOTUS = { petal: "#e8a4b8", light: "#f3d1dc" } as const;

// ── P5-A：纹理 key 解析（唯一来源；FarmScene 复用，避免两处命名漂移）──

const SEASON_SUFFIX: Record<Season, string> = {
  spring: "",
  summer: "_summer",
  autumn: "_autumn",
  winter: "_winter",
};

const GRASS_VARIANT_SUFFIX = ["", "_b", "_c", "_d"] as const;

export const GRASS_VARIANT_COUNT = 4;

/** 草地：春季复用 P4 的 4 个既有 key，其余季节加季名后缀 */
export function grassKey(season: Season, variant: number): string {
  const n = GRASS_VARIANT_COUNT;
  const i = ((variant % n) + n) % n;
  return `tile_grass${SEASON_SUFFIX[season]}${GRASS_VARIANT_SUFFIX[i]}`;
}

/** 树木：species 0 = 阔叶，1 = 变体（春粉花 / 夏绿果 / 秋金叶 / 冬针叶） */
export function treeKey(season: Season, species: 0 | 1): string {
  return `tile_tree${SEASON_SUFFIX[season]}${species === 1 ? "_b" : ""}`;
}

/** 岩石：species 0 = 堆石，1 = 卧石（几何逐值不变，仅内嵌草底随季节） */
export function rockKey(season: Season, species: 0 | 1): string {
  return `tile_rock${SEASON_SUFFIX[season]}${species === 1 ? "_b" : ""}`;
}

/** 水面：春季复用既有 tile_water_a / tile_water_b */
export function waterKey(season: Season, frame: 0 | 1): string {
  const s = season === "spring" ? "" : `_${season}`;
  return `tile_water${s}_${frame === 1 ? "b" : "a"}`;
}

function reg(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  // ── P5-A（D-P5-1 已批准）：逐 key 幂等守卫 ──
  // 把幂等性从"单个门闩 key"加固为"逐 key 幂等"：既有的 tile_grass 门闩与首注册
  // 顺序保持不变，同时在 key 已存在时跳过，避免 addCanvas 返回 null 触发下面的 throw。
  if (scene.textures.exists(key)) return;
  const cnv = document.createElement("canvas");
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext("2d");
  if (!ctx) throw new Error(`无法创建画布上下文: ${key}`);
  draw(ctx);
  const tex = scene.textures.addCanvas(key, cnv);
  if (!tex) throw new Error(`注册画布纹理失败: ${key}`);
  tex.refresh();
}

/** 定式辅助：填色（确定性手工排布，不用随机散布，避免满屏噪点） */
function fill(ctx: CanvasRenderingContext2D, color: string, rects: number[][]): void {
  ctx.fillStyle = color;
  for (const r of rects) ctx.fillRect(r[0], r[1], r[2], r[3]);
}

function shadow(ctx: CanvasRenderingContext2D, rects: number[][]): void {
  fill(ctx, P.shadow, rects);
}

// ── 抛光：确定性小工具 ────────────────────────────

/**
 * 草簇（P5-A 重做：2px 宽亮叶 ×2 + 短暗侧叶 ×2 + 1px 暗根，总高 6px）。
 * 旧版为 1×2 + 1×1 的点状细节，在 1 倍下读作噪点而非草；本版保证关键造型 ≥2px。
 * snow = true 时叶尖加 1px 雪帽（冬季）。
 */
function grassTuft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: SeasonRamp,
  snow: boolean,
): void {
  // 两片高亮主叶（左高右略低，避免左右对称的死板感）
  fill(ctx, R.tLight, [[x, y, 1, 4], [x + 1, y + 1, 1, 4]]);
  // 短暗侧叶（贴地，制造草根厚度）
  fill(ctx, R.tDark, [[x - 1, y + 3, 1, 2], [x + 2, y + 2, 1, 3]]);
  // 暗根
  fill(ctx, R.tDark, [[x, y + 4, 3, 1]]);
  // 冬季雪帽
  if (snow) fill(ctx, R.aMain, [[x, y, 1, 1], [x + 1, y + 1, 1, 1]]);
}

/**
 * 木质 bevel（给定内缩边界的矩形）：左上受光 1px / 右下暗边 1px，
 * 让木牌/木格读作凸起实体而非纯色块。
 */
function woodBevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  fill(ctx, P.panelLight, [[x, y, w, 1], [x, y, 1, h]]);
  fill(ctx, P.panelDark, [[x, y + h - 1, w, 1], [x + w - 1, y, 1, h]]);
}

// ── P2：11 种作物特征主色/高光（种子袋与收获图标共用一张表；显式色值避免 11 果撞色）──
const CROP_FEATURE: ReadonlyArray<{ id: string; main: string; hi: string }> = [
  { id: "dew_radish", main: "#f3f7f9", hi: "#dde5ea" }, // 青白萝卜
  { id: "morning_bean", main: "#7fb854", hi: "#5d9a3f" }, // 晨光豆荚
  { id: "starberry", main: "#d9534f", hi: "#f08a83" }, // 星芽莓（红）
  { id: "ember_tomato", main: "#c0392b", hi: "#e86a5c" }, // 火绒番茄（深红）
  { id: "blue_melon", main: "#4a8fc0", hi: "#63a8d8" }, // 蓝湾瓜（水蓝）
  { id: "gold_corn", main: "#f5c542", hi: "#ffdf7e" }, // 金穗玉米（金）
  { id: "amber_pumpkin", main: "#e8843c", hi: "#f2a866" }, // 琥珀南瓜（橙）
  { id: "leaf_cabbage", main: "#6d9c43", hi: "#7fae4f" }, // 丰叶白菜（叶绿）
  { id: "moon_grape", main: "#7a5a8a", hi: "#b295c4" }, // 月纹葡萄（暖紫）
  { id: "snow_flower", main: "#f3f7f9", hi: "#9fc4e0" }, // 雪晶花（白+冰蓝高光）
  { id: "ice_grass", main: "#63a8d8", hi: "#f3f7f9" }, // 冰露草（水蓝+白霜）
];

/** P2：种子袋图标（牛皮纸袋 + 三粒特征色种子，1px 高光） */
function seedBag(ctx: CanvasRenderingContext2D, main: string, hi: string): void {
  fill(ctx, P.woodDark, [[3, 5, 10, 9]]);
  fill(ctx, P.woodMid, [[4, 6, 8, 7]]);
  fill(ctx, P.woodLight, [[4, 5, 8, 2]]);
  fill(ctx, P.woodDark, [[4, 7, 8, 1]]);
  const slots: number[][] = [[5, 9], [8, 9], [11, 10]];
  for (let i = 0; i < 3; i++) {
    const s = slots[i];
    fill(ctx, main, [[s[0], s[1], 2, 3]]);
    fill(ctx, hi, [[s[0], s[1], 1, 2]]);
  }
}

/** P2：收获作物小图标（深描边 + 特征果 + 顶光 + 1px 蒂叶 + 可收获闪光） */
function cropIcon(ctx: CanvasRenderingContext2D, main: string, hi: string): void {
  fill(ctx, P.outline, [[4, 4, 8, 9]]);
  fill(ctx, main, [[5, 5, 6, 7]]);
  fill(ctx, hi, [[5, 5, 6, 1], [5, 6, 1, 5]]);
  fill(ctx, P.leafMid, [[11, 3, 2, 2]]);
  fill(ctx, P.white, [[12, 2, 1, 1]]);
}

// ── 地图块基底 ───────────────────────────────────

/**
 * 一朵小野花（P5-A 修正：旧版把花瓣与花心填在**同一像素**，花瓣实际永不可见）。
 * 现为 3×3 实心花：4 瓣 + 1 花心 + 1px 茎。
 */
function flower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  petal: string,
  core: string,
  R: SeasonRamp,
): void {
  // 茎先画（y+1..y+3），随后花瓣覆掉 y+1/y+2 → 最终下方留 1px 可见茎
  fill(ctx, R.gEdge, [[x, y + 1, 1, 3]]);
  fill(ctx, petal, [[x, y, 1, 1], [x - 1, y + 1, 1, 1], [x + 1, y + 1, 1, 1], [x, y + 2, 1, 1]]);
  fill(ctx, core, [[x, y + 1, 1, 1]]);
}

/** 三叶草（3 片 2×2 叶 + 1px 亮心）；常驻变体用核心层绿 → 四季常绿 */
function clover(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  main: string,
  hi: string,
): void {
  fill(ctx, main, [[x, y, 2, 2], [x + 2, y + 2, 2, 2], [x - 1, y + 2, 2, 2]]);
  fill(ctx, hi, [[x + 1, y + 1, 1, 1]]);
}

/** 落叶（2px 斜向小片，秋季） */
function fallenLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  fill(ctx, color, [[x, y, 2, 1], [x + 1, y + 1, 2, 1], [x + 2, y + 2, 1, 1]]);
}

/** 雪块（霜边 + 雪面 + 1px 顶光；冬季厚雪变体） */
function snowPatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  R: SeasonRamp,
): void {
  fill(ctx, R.aAlt, [[x, y, w, h]]);
  fill(ctx, R.aMain, [[x, y, w - 1, h - 1]]);
  fill(ctx, R.aMain, [[x, y, Math.max(1, w - 2), 1]]);
}

/**
 * 季节点缀：沿用既有花草**坐标**（保证变体语义不变），只按季节切换形态。
 * alt = 该位原本是金花（true）/ 白花（false）。
 */
function seasonDecor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  season: Season,
  alt: boolean,
  R: SeasonRamp,
): void {
  switch (season) {
    case "spring":
      flower(ctx, x, y, alt ? P.goldLight : P.white, alt ? P.goldDark : R.aAlt, R);
      break;
    case "summer":
      clover(ctx, x, y, R.tLight, R.aAlt);
      break;
    case "autumn":
      fallenLeaf(ctx, x, y, alt ? R.aAlt : R.aMain);
      break;
    default:
      // 冬季不加花；积雪由变体级 snowPatch 与草簇雪帽承担
      break;
  }
}

/**
 * 草地基底（P5-A：四季 × 4 个确定性变体）。
 * 变体的草簇/点缀**坐标与 P4 逐值一致** → 变体语义不变、换季不重排；
 * 随季节切换的只有色阶（SEASON_RAMP）与点缀形态（seasonDecor / 冬季雪块）。
 */
function drawGrass(ctx: CanvasRenderingContext2D, v: number, season: Season = "spring"): void {
  const R = SEASON_RAMP[season];
  const snow = season === "winter";
  ctx.fillStyle = R.gMid;
  ctx.fillRect(0, 0, TILE, TILE);
  switch (v) {
    case 0:
      grassTuft(ctx, 3, 5, R, snow);
      grassTuft(ctx, 12, 8, R, snow);
      grassTuft(ctx, 21, 3, R, snow);
      grassTuft(ctx, 27, 13, R, snow);
      grassTuft(ctx, 7, 18, R, snow);
      grassTuft(ctx, 16, 23, R, snow);
      grassTuft(ctx, 24, 27, R, snow);
      seasonDecor(ctx, 6, 13, season, false, R);
      seasonDecor(ctx, 25, 19, season, true, R);
      break;
    case 1:
      // 角落成簇 + 单点缀 + 碎石
      grassTuft(ctx, 4, 4, R, snow);
      grassTuft(ctx, 7, 6, R, snow);
      grassTuft(ctx, 6, 9, R, snow);
      grassTuft(ctx, 22, 22, R, snow);
      grassTuft(ctx, 25, 24, R, snow);
      seasonDecor(ctx, 20, 8, season, false, R);
      fill(ctx, P.rockLight, [[14, 14, 2, 1]]);
      break;
    case 2:
      // 疏 + 常驻三叶草（核心层绿 → 四季常绿）
      grassTuft(ctx, 10, 10, R, snow);
      grassTuft(ctx, 22, 16, R, snow);
      grassTuft(ctx, 6, 24, R, snow);
      clover(ctx, 15, 7, P.leafMid, P.leafLight);
      seasonDecor(ctx, 26, 25, season, false, R);
      break;
    default:
      // 底部偏密
      grassTuft(ctx, 3, 12, R, snow);
      grassTuft(ctx, 8, 20, R, snow);
      grassTuft(ctx, 14, 24, R, snow);
      grassTuft(ctx, 20, 18, R, snow);
      grassTuft(ctx, 25, 22, R, snow);
      grassTuft(ctx, 28, 8, R, snow);
      seasonDecor(ctx, 16, 8, season, true, R);
      fill(ctx, P.rockLight, [[4, 4, 2, 1]]);
      break;
  }
  // 冬季积雪块：v1 / v3 为"厚雪"，v0 / v2 只保留草簇雪帽（维持四季辨识度与绿色身份）
  if (snow) {
    if (v === 1) {
      snowPatch(ctx, 12, 19, 8, 5, R);
      snowPatch(ctx, 23, 5, 7, 4, R);
    } else if (v === 3) {
      snowPatch(ctx, 2, 2, 12, 6, R);
      snowPatch(ctx, 19, 17, 10, 6, R);
    }
  }
}

/** 兼容旧调用：草地基底（变体 0） */
function grassBase(ctx: CanvasRenderingContext2D): void {
  drawGrass(ctx, 0);
}

/** 耕地基底（P0 精修：四层清晰垄沟——受光浅条 + 暗沟 + 零星碎石，去随机噪点） */
function soilBase(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = P.dirtMid;
  ctx.fillRect(0, 0, TILE, TILE);
  // 四条垄：每条「暗沟 1px（上）+ 受光浅条 1px（垄脊）」，层次清楚
  const furrows = [6, 12, 18, 24];
  for (const fy of furrows) {
    fill(ctx, P.dirtEdge, [[0, fy, TILE, 1]]);
    fill(ctx, P.dirtLight, [[0, fy + 2, TILE, 1]]);
  }
  // 零星小石块（手工 2 粒，位置确定，不铺满）
  fill(ctx, P.rockLight, [[10, 4, 2, 1], [22, 26, 2, 1]]);
  // 顶部受光 1px / 底部暗边 1px
  ctx.fillStyle = P.dirtLight;
  ctx.fillRect(0, 0, TILE, 1);
  ctx.fillStyle = P.dirtEdge;
  ctx.fillRect(0, TILE - 1, TILE, 1);
}

// ── 水面（P5-A：四季 × 双帧；春季逐值沿用 P4，其余季节换色 + 换点缀）──
function waterBody(ctx: CanvasRenderingContext2D, season: Season, R: SeasonRamp): void {
  ctx.fillStyle = R.wMid;
  ctx.fillRect(0, 0, TILE, TILE);
  // 纵向深度分层：顶部受光浅 / 底部深水暗
  fill(ctx, R.wLight, [[0, 2, TILE, 3]]);
  fill(ctx, R.wDark, [[0, 28, TILE, 3]]);
  // 固定深水斑 2 处（有序分布，非噪点）
  fill(ctx, R.wDark, [[18, 12, 8, 4], [6, 18, 6, 4]]);
  // 冬季：浮冰面。刻意**不做**逐格边框——12 格水连片时会拼出网格感
  if (season === "winter") {
    fill(ctx, R.wLight, [[3, 5, 9, 4], [18, 3, 10, 3], [7, 20, 12, 4]]);
    fill(ctx, R.aAlt, [[4, 6, 7, 2], [19, 4, 8, 1], [8, 21, 10, 2]]);
  }
}

function lilyPads(ctx: CanvasRenderingContext2D, season: Season, R: SeasonRamp): void {
  // 春季逐值保留 P4 原状 → tile_water_a / tile_water_b 内容零回归
  if (season === "spring") {
    fill(ctx, P.leafEdge, [[8, 9, 6, 5]]);
    fill(ctx, P.leafMid, [[9, 10, 4, 3]]);
    fill(ctx, P.leafLight, [[9, 10, 3, 1]]);
    fill(ctx, P.leafEdge, [[20, 20, 5, 4]]);
    fill(ctx, P.leafMid, [[21, 21, 3, 2]]);
    fill(ctx, P.leafLight, [[21, 21, 2, 1]]);
    return;
  }
  if (season === "winter") return; // 结冰：无荷叶

  // 夏 3 片 / 秋 1 片
  const spots: number[][] = season === "summer" ? [[8, 9], [20, 20], [12, 22]] : [[8, 9]];
  for (const s of spots) {
    fill(ctx, P.leafEdge, [[s[0], s[1], 6, 5]]);
    fill(ctx, P.leafMid, [[s[0] + 1, s[1] + 1, 4, 3]]);
    fill(ctx, P.leafLight, [[s[0] + 1, s[1] + 1, 3, 1]]);
  }
  if (season === "summer") {
    // 荷花：粉瓣 + 顶光 + 金花心
    fill(ctx, LOTUS.petal, [[13, 5, 4, 3]]);
    fill(ctx, LOTUS.light, [[13, 5, 4, 1]]);
    fill(ctx, P.goldLight, [[14, 6, 2, 1]]);
  } else {
    // 秋季：叶边萎黄 + 水面浮落叶 3 片
    fill(ctx, R.aMain, [[8, 13, 6, 1]]);
    fallenLeaf(ctx, 4, 6, R.aMain);
    fallenLeaf(ctx, 21, 8, R.aAlt);
    fallenLeaf(ctx, 15, 23, R.aMain);
  }
}

function waterShore(ctx: CanvasRenderingContext2D, season: Season, R: SeasonRamp): void {
  // 四边 dither 岸线（棋盘 1px，与周围草地质感衔接）；冬季改为结霜色
  ctx.fillStyle = season === "winter" ? R.aMain : R.wEdge;
  for (let x = 0; x < TILE; x += 2) {
    ctx.fillRect(x, 0, 1, 1);
    ctx.fillRect(x + 1, TILE - 1, 1, 1);
  }
  for (let y = 0; y < TILE; y += 2) {
    ctx.fillRect(0, y, 1, 1);
    ctx.fillRect(TILE - 1, y + 1, 1, 1);
  }
  if (season === "winter") {
    // 冰裂线（2–5px，手工有序）
    fill(ctx, R.wDark, [[5, 4, 5, 1], [14, 9, 4, 1], [20, 22, 5, 1], [8, 25, 3, 1]]);
  }
}

const WATER_RIPPLES: Record<Season, number[][][]> = {
  // 春季逐值沿用 P4（两帧数组原样）
  spring: [
    [[4, 8, 6, 1], [14, 8, 4, 1], [24, 8, 5, 1], [9, 20, 5, 1], [19, 20, 6, 1], [12, 14, 2, 1], [26, 26, 2, 1]],
    [[7, 6, 4, 1], [17, 6, 5, 1], [3, 14, 6, 1], [13, 14, 4, 1], [23, 24, 5, 1], [20, 10, 2, 1], [6, 26, 2, 1]],
  ],
  // 夏：更宽更亮的镜面高光
  summer: [
    [[3, 7, 9, 1], [15, 7, 7, 1], [25, 7, 6, 1], [8, 19, 8, 1], [19, 19, 9, 1], [12, 13, 4, 1], [26, 25, 4, 1]],
    [[6, 5, 7, 1], [17, 5, 8, 1], [2, 13, 9, 1], [13, 13, 6, 1], [22, 23, 8, 1], [20, 9, 4, 1], [5, 25, 4, 1]],
  ],
  // 秋：碎波（更短更碎，配合浮叶）
  autumn: [
    [[5, 8, 4, 1], [15, 7, 3, 1], [25, 9, 3, 1], [10, 20, 3, 1], [20, 19, 4, 1], [13, 14, 2, 1]],
    [[8, 6, 3, 1], [18, 6, 3, 1], [4, 14, 4, 1], [14, 14, 3, 1], [24, 23, 3, 1], [21, 10, 2, 1]],
  ],
  // 冬：冻结感——两帧仅 1 处高光微移
  winter: [
    [[4, 8, 5, 1], [22, 10, 4, 1]],
    [[4, 8, 5, 1], [23, 10, 4, 1]],
  ],
};

function drawWaterFrame(
  ctx: CanvasRenderingContext2D,
  variant: number,
  season: Season = "spring",
): void {
  const R = SEASON_RAMP[season];
  waterBody(ctx, season, R);
  fill(ctx, R.wLight, WATER_RIPPLES[season][variant]); // 水波高光（两帧不同 → 轻动画）
  lilyPads(ctx, season, R); // 荷叶固定，盖在水波之上
  waterShore(ctx, season, R); // 岸线最后
}

// ── 玩家两帧（32×28，key 与尺寸约定不变）────────────
function drawPlayerFrame(ctx: CanvasRenderingContext2D, frame: number): void {
  ctx.clearRect(0, 0, TILE, 28);

  // 地面柔和投影
  shadow(ctx, [[9, 25, 14, 2]]);

  // 腿（深棕裤 + 深鞋；两帧摆腿幅度不同）
  const legs = frame === 0 ? [[11, 20, 4, 5], [17, 20, 4, 5]] : [[10, 20, 4, 5], [18, 20, 4, 5]];
  const shoes = frame === 0 ? [[10, 25, 6, 2], [17, 25, 6, 2]] : [[9, 25, 6, 2], [18, 25, 6, 2]];
  fill(ctx, P.woodMid, legs);
  fill(ctx, P.outline, shoes);

  // 身体：米色衬衫 + 暖棕围裙（1px 深描边）
  fill(ctx, P.outline, [[8, 12, 16, 9]]);
  fill(ctx, P.cream, [[9, 13, 14, 7]]);
  fill(ctx, P.woodLight, [[11, 14, 10, 6]]);
  fill(ctx, P.woodDark, [[11, 19, 10, 1]]);

  // 手（肤色，随帧摆动）
  const hands = frame === 0 ? [[7, 14, 2, 5], [23, 14, 2, 5]] : [[6, 12, 2, 5], [24, 16, 2, 5]];
  fill(ctx, P.skin, hands);

  // 头（1px 深描边 + 肤色 + 眼睛）
  fill(ctx, P.outline, [[10, 5, 12, 8]]);
  fill(ctx, P.skin, [[11, 6, 10, 6]]);
  fill(ctx, P.outline, [[13, 9, 1, 1], [18, 9, 1, 1]]);

  // 草帽（帽檐 + 帽冠 + 深色帽带）
  fill(ctx, P.outline, [[8, 2, 16, 5]]);
  fill(ctx, P.gold, [[9, 3, 14, 4]]);
  fill(ctx, P.goldLight, [[9, 3, 14, 1]]);
  fill(ctx, P.woodDark, [[11, 6, 10, 1]]);
}

// ── P5-A：树木（2 树种 × 四季；轮廓逐季演进，不是换色）────────

/**
 * 树冠叶瓣集合：`[x, y, w, h]`。
 * 四季的**叶瓣数量、外扩程度、分瓣间距**都不同 → 剪影本身随季节改变：
 * 春 = 高低错落 6 瓣；夏 = 更宽更高的 6 瓣；秋 = 4 瓣拉开、露出枝干；冬 = 不用叶瓣（走光枝/针叶）。
 */
const LOBES_BROADLEAF: Record<Season, number[][]> = {
  spring: [[5, 4, 11, 8], [15, 2, 11, 9], [24, 6, 5, 7], [3, 10, 14, 7], [15, 10, 13, 7], [9, 13, 14, 5]],
  summer: [[10, 1, 13, 7], [4, 3, 11, 8], [17, 3, 11, 8], [2, 9, 13, 8], [17, 9, 13, 8], [9, 12, 14, 6]],
  autumn: [[5, 5, 9, 6], [18, 4, 9, 6], [7, 11, 8, 6], [17, 11, 8, 6], [11, 14, 10, 4]],
  winter: [],
};

const LOBES_VARIANT: Record<Season, number[][]> = {
  spring: [[6, 5, 11, 7], [16, 3, 11, 8], [24, 7, 5, 6], [4, 11, 14, 6], [16, 11, 12, 6], [10, 14, 11, 4]],
  summer: [[11, 2, 12, 7], [5, 4, 11, 8], [17, 4, 11, 8], [3, 10, 13, 7], [17, 10, 13, 7], [10, 13, 13, 5]],
  autumn: [[6, 6, 9, 6], [19, 5, 9, 6], [8, 12, 8, 6], [18, 12, 7, 6], [12, 15, 9, 3]],
  winter: [],
};

type LobeLayerName = "edge" | "mid" | "dark" | "light";

/**
 * 单个叶瓣的某一层。所有绘制都被限制在该叶瓣自身范围内，
 * 因此叶瓣**不可能画出剪影之外**（不会盖住内嵌草地或邻格）。
 * 四角收 2px → 圆润；不同叶瓣的高度差 → 顶部呈不规则起伏。
 */
function lobeLayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  layer: LobeLayerName,
): void {
  const n = 2;
  switch (layer) {
    case "edge":
      fill(ctx, color, [[x + n, y, w - n * 2, h], [x, y + n, w, h - n * 2]]);
      break;
    case "mid":
      fill(ctx, color, [[x + n, y + 1, w - n * 2, h - 2], [x + 1, y + n, w - 2, h - n * 2]]);
      break;
    case "dark":
      // 叶瓣下沿 2px 暗部 → 分瓣之间有层次
      fill(ctx, color, [[x + 1, y + h - 3, w - 2, 2]]);
      break;
    default:
      // 左上受光（光向恒定左上），尺寸被夹在叶瓣内
      fill(ctx, color, [
        [
          x + n,
          y + n,
          Math.max(1, Math.min(Math.floor(w * 0.5), w - n * 2)),
          Math.max(1, Math.min(Math.floor(h * 0.4), h - 3)),
        ],
      ]);
      break;
  }
}

/** 分瓣树冠：按层绘制（先全部描边、再全部中调…）→ 叶瓣合并为单一剪影，无内部接缝 */
function canopy(ctx: CanvasRenderingContext2D, lobes: number[][], ramp: CanopyRamp): void {
  const layers: [string, LobeLayerName][] = [
    [ramp.lEdge, "edge"],
    [ramp.lMid, "mid"],
    [ramp.lDark, "dark"],
    [ramp.lLight, "light"],
  ];
  for (const [color, name] of layers) {
    for (const l of lobes) lobeLayer(ctx, l[0], l[1], l[2], l[3], color, name);
  }
}

/** 树干（3 阶木色 + 1px 深描边 + 节疤 + 根桩外扩）——与 P4 逐值一致 */
function treeTrunk(ctx: CanvasRenderingContext2D): void {
  fill(ctx, P.woodDark, [[11, 25, 2, 1], [21, 25, 2, 1]]);
  fill(ctx, P.woodDark, [[13, 17, 6, 9]]);
  fill(ctx, P.woodMid, [[14, 18, 4, 8]]);
  fill(ctx, P.woodLight, [[14, 18, 1, 8]]);
  fill(ctx, P.woodDark, [[17, 21, 2, 1], [16, 24, 2, 1]]);
}

/** 秋季：冠隙间可见的高位枝干（让"叶薄露枝"真的露出东西，而不是露出背景） */
function autumnBranches(ctx: CanvasRenderingContext2D): void {
  fill(ctx, P.woodDark, [[15, 6, 2, 12]]);
  fill(ctx, P.woodMid, [[15, 6, 1, 12]]);
  fill(ctx, P.woodDark, [[10, 9, 6, 1], [17, 8, 6, 1]]);
}

/** 冬季阔叶树：完全无冠的**光枝骨架** + 枝上积雪（与春夏秋的圆冠形成剪影级差异） */
function bareTree(ctx: CanvasRenderingContext2D, R: SeasonRamp): void {
  // 主干直插到冠位
  fill(ctx, P.woodDark, [[14, 7, 4, 19]]);
  fill(ctx, P.woodMid, [[15, 8, 2, 18]]);
  fill(ctx, P.woodLight, [[15, 8, 1, 18]]);
  // 4 根侧枝（长度/高度错开 → 不规则）
  fill(ctx, P.woodDark, [[8, 10, 6, 2], [19, 8, 6, 2], [9, 15, 5, 2], [19, 14, 6, 2]]);
  fill(ctx, P.woodMid, [[8, 10, 5, 1], [20, 8, 5, 1], [9, 15, 4, 1], [20, 14, 5, 1]]);
  // 细梢
  fill(ctx, P.woodDark, [[6, 8, 2, 2], [25, 6, 2, 2]]);
  // 根桩
  fill(ctx, P.woodDark, [[11, 25, 2, 1], [21, 25, 2, 1]]);
  // 枝上积雪（只落在朝上的枝面）
  fill(ctx, R.aMain, [[8, 9, 6, 1], [19, 7, 6, 1], [9, 14, 5, 1], [19, 13, 6, 1]]);
  fill(ctx, R.aMain, [[14, 6, 4, 1], [6, 7, 2, 1], [25, 5, 2, 1]]);
}

/** 冬季变体树：**针叶锥形**（与光枝树形成"两种树"的强区分）+ 三层雪台阶 */
function conifer(ctx: CanvasRenderingContext2D, R: SeasonRamp): void {
  fill(ctx, P.woodDark, [[14, 22, 4, 4]]);
  fill(ctx, P.woodMid, [[15, 22, 2, 4]]);
  // 底层（最宽）
  fill(ctx, PINE.lEdge, [[6, 16, 20, 7], [8, 14, 16, 3]]);
  fill(ctx, PINE.lMid, [[7, 17, 18, 5], [9, 15, 14, 3]]);
  fill(ctx, PINE.lLight, [[9, 17, 5, 3]]);
  // 中层
  fill(ctx, PINE.lEdge, [[9, 10, 14, 7]]);
  fill(ctx, PINE.lMid, [[10, 11, 12, 5]]);
  fill(ctx, PINE.lLight, [[12, 11, 4, 3]]);
  // 顶层（最窄）
  fill(ctx, PINE.lEdge, [[12, 4, 8, 7]]);
  fill(ctx, PINE.lMid, [[13, 5, 6, 5]]);
  fill(ctx, PINE.lLight, [[14, 5, 3, 3]]);
  // 三层雪台阶 + 顶雪
  fill(ctx, R.aMain, [[8, 14, 16, 1], [10, 10, 12, 1], [13, 4, 6, 1], [13, 3, 6, 1]]);
  // 根桩
  fill(ctx, P.woodDark, [[11, 25, 2, 1], [21, 25, 2, 1]]);
}

/** 春花点（2×2 花簇 + 1px 金花心） */
function blossomDots(ctx: CanvasRenderingContext2D): void {
  fill(ctx, BLOSSOM.lLight, [[8, 6, 3, 3], [15, 5, 3, 3], [12, 10, 3, 3], [20, 8, 3, 3]]);
  fill(ctx, P.goldLight, [[9, 7, 1, 1], [16, 6, 1, 1], [13, 11, 1, 1], [21, 9, 1, 1]]);
}

/** 夏季变体树的果实（2×2 暖红 + 1px 高光）——用于把树种 1 与树种 0 在夏季区分开 */
function fruitDots(ctx: CanvasRenderingContext2D): void {
  fill(ctx, "#c0392b", [[9, 7, 2, 2], [16, 6, 2, 2], [13, 11, 2, 2], [21, 9, 2, 2]]);
  fill(ctx, "#e86a5c", [[9, 7, 1, 1], [16, 6, 1, 1], [13, 11, 1, 1], [21, 9, 1, 1]]);
}

/** 冠下落叶（秋季，5 片，位置确定） */
function leavesAtBase(ctx: CanvasRenderingContext2D, R: SeasonRamp): void {
  fallenLeaf(ctx, 6, 26, R.aMain);
  fallenLeaf(ctx, 10, 27, R.aAlt);
  fallenLeaf(ctx, 24, 26, R.aMain);
  fallenLeaf(ctx, 20, 27, R.aAlt);
  fallenLeaf(ctx, 15, 27, R.aMain);
}

/**
 * 树木（P5-A）
 * - 树种 0 阔叶：春/夏/秋靠叶瓣数量与外扩程度改变剪影，冬季转为**光枝骨架**
 * - 树种 1 变体：春粉花 / 夏绿果 / 秋金叶，冬季转为**针叶锥形**
 * - 内嵌草底必须使用**当季**草地：否则冬季会出现绿色方砖（D-P5-2 红线）
 */
function drawTree(ctx: CanvasRenderingContext2D, species: 0 | 1, season: Season): void {
  const R = SEASON_RAMP[season];
  drawGrass(ctx, species === 1 ? 1 : 0, season);
  shadow(ctx, [[8, 25, 16, 2]]);

  if (season === "winter") {
    if (species === 1) conifer(ctx, R);
    else bareTree(ctx, R);
    return;
  }

  treeTrunk(ctx);
  if (season === "autumn") autumnBranches(ctx);

  const lobes = species === 1 ? LOBES_VARIANT[season] : LOBES_BROADLEAF[season];
  const ramp: CanopyRamp = species === 1 && season === "spring" ? BLOSSOM : R;
  canopy(ctx, lobes, ramp);

  if (species === 1 && season === "spring") blossomDots(ctx);
  if (species === 1 && season === "summer") fruitDots(ctx);
  if (season === "autumn") leavesAtBase(ctx, R);
}

// ── P5-A：岩石（几何逐值沿用 P4，仅内嵌草底随季节）────────────

/**
 * 岩石：species 0 = 堆石（草底 v2）/ species 1 = 卧石（草底 v3）。
 * 石头的 fill 坐标与 P4 **逐值一致**，唯一变化是内嵌草底改用当季草地
 * → 冬季不再残留绿色底面（D-P5-2），且碰撞体尺寸不变。
 */
function drawRock(ctx: CanvasRenderingContext2D, species: 0 | 1, season: Season): void {
  if (species === 0) {
    drawGrass(ctx, 2, season);
    shadow(ctx, [[6, 24, 20, 2]]);
    // 大石块（收角圆润 + 1px 深描边 + 三阶明暗 + 裂纹）
    fill(ctx, P.rockEdge, [[6, 9, 18, 14], [5, 11, 20, 11], [8, 8, 14, 15]]);
    fill(ctx, P.rockMid, [[7, 10, 16, 12], [6, 12, 18, 9], [9, 9, 12, 13]]);
    fill(ctx, P.rockLight, [[8, 11, 6, 4], [11, 13, 3, 2]]);
    fill(ctx, P.rockDark, [[8, 19, 14, 4], [16, 14, 1, 5]]);
    // 小石块（叠在右下，制造堆叠层次）
    fill(ctx, P.rockEdge, [[18, 17, 8, 7], [17, 18, 10, 5]]);
    fill(ctx, P.rockMid, [[19, 18, 6, 5]]);
    fill(ctx, P.rockLight, [[19, 18, 3, 2]]);
  } else {
    drawGrass(ctx, 3, season);
    shadow(ctx, [[7, 23, 18, 2]]);
    // 横向卧石（更扁，区别于堆石）
    fill(ctx, P.rockEdge, [[5, 13, 22, 9], [4, 14, 24, 7], [8, 12, 16, 11]]);
    fill(ctx, P.rockMid, [[6, 14, 20, 7], [5, 15, 22, 5], [9, 13, 14, 9]]);
    fill(ctx, P.rockLight, [[8, 14, 8, 3], [18, 15, 4, 2]]);
    fill(ctx, P.rockDark, [[8, 19, 16, 3], [22, 16, 1, 4]]);
  }
}

/** 生成全部占位纹理（幂等：已存在则跳过；P0 无新增 key，短路机制不变） */
export function ensurePlaceholderTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("tile_grass")) return;

  // ── 地图块（32×32）─────────────────────────────

  reg(scene, "tile_grass", TILE, TILE, grassBase);

  // P4：草地变体 b/c/d（不同草簇/花/碎石布局，FarmScene 按格确定性选用，消除平铺机械感）
  reg(scene, "tile_grass_b", TILE, TILE, (ctx) => drawGrass(ctx, 1));
  reg(scene, "tile_grass_c", TILE, TILE, (ctx) => drawGrass(ctx, 2));
  reg(scene, "tile_grass_d", TILE, TILE, (ctx) => drawGrass(ctx, 3));

  reg(scene, "tile_soil", TILE, TILE, soilBase);

  // P5-A：树（四季 × 2 树种）——春季复用既有 key，其余季节为新增 key
  reg(scene, "tile_tree", TILE, TILE, (ctx) => drawTree(ctx, 0, "spring"));
  reg(scene, "tile_tree_b", TILE, TILE, (ctx) => drawTree(ctx, 1, "spring"));

  // P5-A：岩石（几何逐值沿用 P4，仅内嵌草底随季节 → 冬季不再残留绿色底面）
  reg(scene, "tile_rock", TILE, TILE, (ctx) => drawRock(ctx, 0, "spring"));
  reg(scene, "tile_rock_b", TILE, TILE, (ctx) => drawRock(ctx, 1, "spring"));

  // P4：篱笆（体积感）——立柱 + 柱帽 + 双横栏 + 金属钉；统一左上受光
  reg(scene, "tile_fence", TILE, TILE, (ctx) => {
    soilBase(ctx);
    shadow(ctx, [[2, 25, 28, 2]]);
    // 两道横栏（顶/中双阶木色 + 木纹 + 钉眼）
    fill(ctx, P.woodDark, [[0, 11, TILE, 4], [0, 19, TILE, 4]]);
    fill(ctx, P.woodMid, [[0, 12, TILE, 2], [0, 20, TILE, 2]]);
    fill(ctx, P.woodLight, [[0, 12, TILE, 1], [0, 20, TILE, 1]]);
    // 两根立柱压栏（柱帽 + 三阶木色 + 受光 + 铆钉）
    fill(ctx, P.woodDark, [[4, 7, 6, 18], [22, 7, 6, 18]]);
    fill(ctx, P.woodMid, [[5, 8, 4, 16], [23, 8, 4, 16]]);
    fill(ctx, P.woodLight, [[5, 8, 1, 16], [23, 8, 1, 16]]);
    // 柱帽（顶部 1px 受光 + 帽沿）
    fill(ctx, P.woodLight, [[4, 7, 6, 1], [22, 7, 6, 1]]);
    fill(ctx, P.woodMid, [[4, 7, 6, 2], [22, 7, 6, 2]]);
    // 金属铆钉（每柱 2 处）
    fill(ctx, P.gold, [[6, 12, 1, 1], [24, 12, 1, 1], [6, 20, 1, 1], [24, 20, 1, 1]]);
    fill(ctx, P.goldLight, [[6, 12, 1, 1], [24, 12, 1, 1]]);
  });

  // P4：床（体积感）——床腿 + 床框 + 枕头 + 垫被层次，统一左上受光
  reg(scene, "tile_bed", TILE, TILE, (ctx) => {
    soilBase(ctx);
    shadow(ctx, [[3, 25, 26, 2]]);
    // 床腿（4 处，落地感）
    fill(ctx, P.woodDark, [[4, 24, 3, 2], [25, 24, 3, 2], [4, 9, 2, 2], [26, 9, 2, 2]]);
    // 木床框（1px 深框 + 三阶木色 + 顶部受光）
    fill(ctx, P.woodDark, [[4, 8, 24, 17]]);
    fill(ctx, P.woodMid, [[5, 9, 22, 15]]);
    fill(ctx, P.woodLight, [[5, 9, 22, 1]]);
    // 枕头（白 + 折痕 + 1px 阴影）
    fill(ctx, P.whiteShade, [[7, 16, 8, 1]]);
    fill(ctx, P.white, [[7, 11, 8, 5]]);
    fill(ctx, P.whiteShade, [[7, 14, 8, 2]]);
    // 暖色被褥（顶部受光 + 褶线 + 左侧高光）
    fill(ctx, P.blanket, [[15, 11, 11, 13]]);
    fill(ctx, P.blanketLight, [[15, 11, 11, 2], [15, 11, 1, 13]]);
    fill(ctx, P.woodDark, [[15, 17, 11, 1]]);
  });

  reg(scene, "tile_water", TILE, TILE, (ctx) => drawWaterFrame(ctx, 0));

  // ── P1：水面双帧（仅水波高光不同，底色/岸线同源）与开垦新翻土纹理 ──
  reg(scene, "tile_water_a", TILE, TILE, (ctx) => drawWaterFrame(ctx, 0));
  reg(scene, "tile_water_b", TILE, TILE, (ctx) => drawWaterFrame(ctx, 1));

  // 新翻土：比原生耕地更深，横向垄线更密更清晰 + 有序翻土块（去随机噪点）
  reg(scene, "tile_tilled", TILE, TILE, (ctx) => {
    ctx.fillStyle = P.dirtDark;
    ctx.fillRect(0, 0, TILE, TILE);
    // 五道垄：每道「暗沟 1px（上）+ 受光浅条 1px（垄脊）」，层次整齐
    for (const fy of [5, 11, 17, 23, 29]) {
      fill(ctx, P.dirtEdge, [[0, fy, TILE, 1]]);
      fill(ctx, P.dirtMid, [[0, fy + 1, TILE, 1]]);
    }
    // 翻土块（浅 1px 顶光 + 深 1px 底影，手工 6 块有序排布，不铺满）
    fill(ctx, P.dirtLight, [[4, 7, 4, 3], [15, 7, 3, 3], [25, 7, 3, 3], [8, 19, 3, 3], [19, 19, 4, 3], [28, 19, 2, 3]]);
    fill(ctx, P.dirtEdge, [[4, 10, 4, 1], [15, 10, 3, 1], [25, 10, 3, 1], [8, 22, 3, 1], [19, 22, 4, 1], [28, 22, 2, 1]]);
  });

  // ── P1：物品图标（16×16；锄头/水壶/种子通用/空槽）──
  reg(scene, "icon_hoe", 16, 16, (ctx) => {
    // 斜置锄头：木柄（对角）+ 深色锄刃
    fill(ctx, P.woodDark, [[5, 2, 7, 1]]);
    fill(ctx, P.woodMid, [[4, 3, 8, 1], [3, 4, 8, 1], [2, 5, 7, 1], [1, 6, 5, 1]]);
    fill(ctx, P.woodLight, [[5, 2, 2, 1]]);
    fill(ctx, P.rockEdge, [[0, 8, 2, 5]]);
    fill(ctx, P.rockMid, [[1, 9, 1, 4], [3, 7, 4, 6], [4, 8, 6, 4], [8, 10, 4, 3], [9, 12, 3, 1]]);
    fill(ctx, P.rockLight, [[4, 8, 2, 2]]);
  });

  reg(scene, "icon_watering_can", 16, 16, (ctx) => {
    // 水壶：罐体（三阶水蓝）+ 提手 + 壶嘴 + 出水珠
    fill(ctx, P.waterEdge, [[4, 4, 8, 9]]);
    fill(ctx, P.waterDark, [[5, 5, 6, 7]]);
    fill(ctx, P.waterMid, [[5, 6, 6, 4]]);
    fill(ctx, P.waterLight, [[5, 5, 6, 1]]);
    // 提手
    fill(ctx, P.waterEdge, [[5, 1, 6, 2]]);
    fill(ctx, P.waterMid, [[6, 2, 4, 1]]);
    // 壶嘴
    fill(ctx, P.waterEdge, [[12, 5, 3, 2]]);
    fill(ctx, P.waterMid, [[13, 6, 2, 1]]);
    // 出水珠
    fill(ctx, P.waterLight, [[14, 8, 1, 1], [15, 10, 1, 1], [14, 12, 1, 1]]);
  });

  reg(scene, "icon_seed", 16, 16, (ctx) => {
    // 种子袋（牛皮纸）+ 三粒彩色种子（暖色系内三色区分，不引入外色）
    fill(ctx, P.woodDark, [[3, 5, 10, 9]]);
    fill(ctx, P.woodMid, [[4, 6, 8, 7]]);
    fill(ctx, P.woodLight, [[4, 5, 8, 2]]);
    fill(ctx, P.woodDark, [[4, 7, 8, 1]]);
    // 种子 ×3（金/叶/土 三色，1px 高光）
    fill(ctx, P.goldDark, [[5, 9, 2, 3], [8, 9, 2, 3], [11, 10, 2, 3]]);
    fill(ctx, P.gold, [[5, 9, 1, 2]]);
    fill(ctx, P.leafDark, [[8, 9, 1, 2]]);
    fill(ctx, P.leafLight, [[8, 9, 1, 1]]);
    fill(ctx, P.dirtLight, [[11, 10, 1, 2]]);
    fill(ctx, P.dirtMid, [[11, 11, 1, 1]]);
  });

  reg(scene, "icon_empty", 16, 16, (ctx) => {
    // 空槽：深底 + 1px 内阴影 + 浅灰叉号
    fill(ctx, P.outline, [[0, 0, 16, 16]]);
    fill(ctx, P.dirtEdge, [[1, 1, 14, 14]]);
    fill(ctx, "rgba(0, 0, 0, 0.25)", [[2, 2, 12, 1]]);
    fill(ctx, P.rockDark, [[5, 5, 6, 6]]);
    fill(ctx, P.rockMid, [[6, 6, 4, 4]]);
    fill(ctx, P.rockLight, [[6, 6, 2, 1]]);
  });

  // ── 玩家（32×28，key 不变）─────────────────────
  reg(scene, "player_0", TILE, 28, (ctx) => drawPlayerFrame(ctx, 0));
  reg(scene, "player_1", TILE, 28, (ctx) => drawPlayerFrame(ctx, 1));

  // ── HUD 金币图标（16×16：金币堆 + 闪光）────────
  reg(scene, "icon_gold", 16, 16, (ctx) => {
    // 垫底两枚暗金
    fill(ctx, P.goldDark, [[2, 9, 8, 5], [9, 10, 6, 4]]);
    // 主币（深描边 + 三阶 + 币沿）
    fill(ctx, P.outline, [[4, 2, 9, 8]]);
    fill(ctx, P.gold, [[5, 3, 7, 6]]);
    fill(ctx, P.goldLight, [[5, 3, 7, 1], [5, 4, 1, 4]]);
    fill(ctx, P.goldDark, [[5, 8, 7, 1], [11, 4, 1, 4]]);
    // 闪光
    fill(ctx, P.white, [[12, 1, 1, 1], [2, 5, 1, 1]]);
  });

  // ── 作物四阶段（32×32 透明底，叠在耕地层之上）──

  // 种子期：土堆 + 三粒种子（微高光）
  reg(scene, "crop_seed", TILE, TILE, (ctx) => {
    shadow(ctx, [[11, 24, 10, 2]]);
    fill(ctx, P.dirtDark, [[13, 22, 6, 2]]);
    fill(ctx, P.outline, [[12, 19, 2, 2], [15, 18, 2, 2], [18, 19, 2, 2]]);
    fill(ctx, P.dirtMid, [[12, 19, 2, 1], [15, 18, 2, 1], [18, 19, 2, 1]]);
    fill(ctx, P.grassEdge, [[9, 24, 2, 1], [22, 24, 2, 1]]);
  });

  // 幼苗期：短茎 + 左右两片叶（亮叶 / 中叶）+ 顶芽
  reg(scene, "crop_sprout", TILE, TILE, (ctx) => {
    shadow(ctx, [[13, 24, 6, 2]]);
    fill(ctx, P.leafEdge, [[14, 15, 4, 9]]);
    fill(ctx, P.leafDark, [[15, 16, 2, 8]]);
    fill(ctx, P.leafLight, [[15, 15, 2, 1]]);
    fill(ctx, P.leafMid, [[8, 17, 6, 3]]);
    fill(ctx, P.leafEdge, [[8, 19, 6, 1]]);
    fill(ctx, P.leafLight, [[18, 15, 6, 3]]);
    fill(ctx, P.leafEdge, [[18, 17, 6, 1]]);
  });

  // 生长期：高茎 + 四片叶 + 顶部嫩芽
  reg(scene, "crop_young", TILE, TILE, (ctx) => {
    shadow(ctx, [[11, 25, 10, 2]]);
    fill(ctx, P.leafEdge, [[14, 9, 4, 16]]);
    fill(ctx, P.leafDark, [[15, 10, 2, 15]]);
    fill(ctx, P.leafMid, [[7, 13, 7, 3]]);
    fill(ctx, P.leafEdge, [[7, 15, 7, 1]]);
    fill(ctx, P.leafLight, [[18, 13, 7, 3]]);
    fill(ctx, P.leafEdge, [[18, 15, 7, 1]]);
    fill(ctx, P.leafLight, [[7, 18, 7, 3]]);
    fill(ctx, P.leafEdge, [[7, 20, 7, 1]]);
    fill(ctx, P.leafMid, [[18, 18, 7, 3]]);
    fill(ctx, P.leafEdge, [[18, 20, 7, 1]]);
    fill(ctx, P.leafLight, [[13, 8, 6, 3]]);
    fill(ctx, P.leafEdge, [[13, 10, 6, 1]]);
  });

  // 成熟期：圆润株丛 + 三颗果实（金 + 高光）+ 白色闪光（可收获提示）
  reg(scene, "crop_mature", TILE, TILE, (ctx) => {
    shadow(ctx, [[9, 25, 14, 2]]);
    // 株丛（收角 + 1px 深描边 + 顶光 / 底暗）
    fill(ctx, P.leafEdge, [[8, 9, 16, 12], [7, 11, 18, 8], [10, 8, 12, 14]]);
    fill(ctx, P.leafMid, [[9, 10, 14, 10], [8, 12, 16, 6], [11, 9, 10, 12]]);
    fill(ctx, P.leafLight, [[10, 10, 6, 4]]);
    fill(ctx, P.leafDark, [[9, 17, 14, 3]]);
    // 果实 ×3
    fill(ctx, P.goldDark, [[11, 13, 4, 4], [17, 15, 4, 4], [14, 18, 4, 4]]);
    fill(ctx, P.gold, [[11, 13, 3, 3], [17, 15, 3, 3], [14, 18, 3, 3]]);
    fill(ctx, P.goldLight, [[11, 13, 2, 1], [17, 15, 2, 1], [14, 18, 2, 1]]);
    // 可收获闪光
    fill(ctx, P.white, [[8, 7, 1, 1], [23, 9, 1, 1], [21, 6, 1, 1]]);
  });

  // ── P2：按 cropId 区分的成熟期纹理（种子/幼苗/生长共用通用阶段，仅成熟期分化）──
  // 果实三连（每颗 1px 深描边 + 主色 + 顶光，小尺寸下与株丛可分）
  const drawFruits = (ctx: CanvasRenderingContext2D, main: string, hi: string) => {
    const fruit: number[][] = [[11, 13], [17, 15], [14, 18]];
    for (const f of fruit) {
      fill(ctx, P.outline, [[f[0] - 1, f[1], 1, 5], [f[0] + 4, f[1], 1, 5], [f[0], f[1] - 1, 5, 1], [f[0], f[1] + 4, 5, 1]]);
      fill(ctx, main, [[f[0], f[1], 4, 4]]);
      fill(ctx, hi, [[f[0], f[1], 3, 1]]);
    }
  };

  const fruitBush = (ctx: CanvasRenderingContext2D, main: string, hi: string) => {
    shadow(ctx, [[9, 25, 14, 2]]);
    // 株丛（收角 + 1px 深描边 + 顶光 / 底暗）
    fill(ctx, P.leafEdge, [[8, 9, 16, 12], [7, 11, 18, 8], [10, 8, 12, 14]]);
    fill(ctx, P.leafMid, [[9, 10, 14, 10], [8, 12, 16, 6], [11, 9, 10, 12]]);
    fill(ctx, P.leafLight, [[10, 10, 6, 4]]);
    fill(ctx, P.leafDark, [[9, 17, 14, 3]]);
    // 特征果实 ×3（带深描边）
    drawFruits(ctx, main, hi);
    // 可收获闪光
    fill(ctx, P.white, [[8, 7, 1, 1], [23, 9, 1, 1], [21, 6, 1, 1]]);
  };

  for (const f of CROP_FEATURE) {
    reg(scene, `crop_${f.id}_mature`, TILE, TILE, (ctx) => fruitBush(ctx, f.main, f.hi));
    reg(scene, `icon_seed_${f.id}`, 16, 16, (ctx) => seedBag(ctx, f.main, f.hi));
    reg(scene, `icon_crop_${f.id}`, 16, 16, (ctx) => cropIcon(ctx, f.main, f.hi));
  }

  // ── P3：HUD 木质面板（真实木纹：外投影 + bevel 凸起 + 四角金属件 + 横向纹理 + 内侧高光）──
  // 用 2px 外投影边距，画布 154×34；FarmScene 定位时需含投影（origin 不变，尺寸 +4）
  reg(scene, "panel_wide", 154, 34, (ctx) => {
    const bx = 2; // 投影边距
    const by = 2;
    const W = 150;
    const H = 30;
    // 落影（右下偏移，柔和 2 阶）
    fill(ctx, "rgba(0, 0, 0, 0.28)", [[bx + 1, by + 1, W, H]]);
    fill(ctx, "rgba(0, 0, 0, 0.18)", [[bx, by, W, H]]);
    // 木面基底
    ctx.fillStyle = P.panelMid;
    ctx.fillRect(bx, by, W, H);
    // bevel（左上受光 / 右下暗边，读作凸起实体）
    woodBevel(ctx, bx, by, W, H);
    // 横向木纹（确定性 3 道 + 1 处节疤，节制不密）
    fill(ctx, P.panelDark, [[bx + 2, by + 9, W - 4, 1], [bx + 2, by + 19, W - 4, 1], [bx + 2, by + 24, W - 4, 1]]);
    fill(ctx, P.panelLight, [[bx + 2, by + 4, W - 4, 1]]);
    // 节疤（1px 小环）
    fill(ctx, P.panelDark, [[bx + 120, by + 13, 3, 3]]);
    fill(ctx, P.panelMid, [[bx + 121, by + 14, 1, 1]]);
    // 内侧金边（沿 bevel 内侧一圈）
    fill(ctx, P.panelGold, [
      [bx + 1, by + 1, W - 2, 1],
      [bx + 1, by + H - 1, W - 2, 1],
      [bx + 1, by + 1, 1, H - 2],
      [bx + W - 2, by + 1, 1, H - 2],
    ]);
    // 四角金属件（2×2 铆钉 + 高光点）
    const corners: number[][] = [
      [bx, by],
      [bx + W - 2, by],
      [bx, by + H - 2],
      [bx + W - 2, by + H - 2],
    ];
    for (const c of corners) {
      fill(ctx, P.panelEdge, [[c[0], c[1], 3, 3]]);
      fill(ctx, P.panelGold, [[c[0] + 1, c[1] + 1, 1, 1]]);
    }
  });

  // ── P3：快捷栏格（凹进木槽：外深描边 + 顶左暗/底右亮的内凹 bevel）与选中态（凸起金框 + 底影）──
  reg(scene, "panel_slot", 16, 16, (ctx) => {
    // 底影（1px，让木格浮于底栏）
    fill(ctx, "rgba(0, 0, 0, 0.30)", [[1, 15, 15, 1]]);
    // 外描边（深）
    ctx.fillStyle = P.panelEdge;
    ctx.fillRect(0, 0, 16, 16);
    // 木面（中棕）
    ctx.fillStyle = P.panelMid;
    ctx.fillRect(1, 1, 14, 14);
    // 内凹 bevel：顶/左暗（陷进去的阴影），底/右亮（受光边缘）→ 读作凹槽
    fill(ctx, P.panelDark, [[1, 1, 14, 1], [1, 1, 1, 14]]);
    fill(ctx, P.panelLight, [[1, 14, 14, 1], [14, 1, 1, 14]]);
    // 槽底再暗 1px（物品放进去的空间感）
    fill(ctx, P.panelDark, [[3, 3, 10, 10]]);
  });

  reg(scene, "panel_slot_selected", 16, 16, (ctx) => {
    // 凸起金框 + 底影（压在选中格上，读作被点亮的突出状态）
    fill(ctx, "rgba(0, 0, 0, 0.30)", [[1, 15, 15, 1]]);
    // 金框（四边 1px 金 + 角 2px 高光）
    fill(ctx, P.gold, [[0, 0, 16, 1], [0, 15, 16, 1], [0, 0, 1, 16], [15, 0, 1, 16]]);
    fill(ctx, P.goldLight, [[0, 0, 2, 2], [14, 0, 2, 2], [0, 14, 2, 2], [14, 14, 2, 2]]);
    // 亮木底（比常规格更亮，制造“被点亮”感）
    ctx.fillStyle = P.panelLight;
    ctx.fillRect(2, 2, 12, 12);
    fill(ctx, P.panelMid, [[3, 13, 10, 1]]);
  });

  // ── P5-A：四季环境纹理（新增 30 个 key）────────────────────
  // 硬要求：**一次性无条件全部注册**，禁止按季懒加载 —— 否则换季时缺 key
  // 会让 Phaser 渲染绿色 __MISSING 方块。
  // 春季直接复用上方已注册的既有 key（tile_grass* / tile_tree* / tile_rock* / tile_water_a|b）。
  const OFF_SEASONS: readonly Season[] = ["summer", "autumn", "winter"];
  for (const season of OFF_SEASONS) {
    // 草地 4 变体（变体语义与春季一致）
    for (let v = 0; v < GRASS_VARIANT_COUNT; v++) {
      reg(scene, grassKey(season, v), TILE, TILE, (ctx) => drawGrass(ctx, v, season));
    }
    // 树木 2 树种（阔叶 / 变体）
    reg(scene, treeKey(season, 0), TILE, TILE, (ctx) => drawTree(ctx, 0, season));
    reg(scene, treeKey(season, 1), TILE, TILE, (ctx) => drawTree(ctx, 1, season));
    // 岩石 2 种（堆石 / 卧石）
    reg(scene, rockKey(season, 0), TILE, TILE, (ctx) => drawRock(ctx, 0, season));
    reg(scene, rockKey(season, 1), TILE, TILE, (ctx) => drawRock(ctx, 1, season));
    // 水面 2 帧
    reg(scene, waterKey(season, 0), TILE, TILE, (ctx) => drawWaterFrame(ctx, 0, season));
    reg(scene, waterKey(season, 1), TILE, TILE, (ctx) => drawWaterFrame(ctx, 1, season));
  }
}
