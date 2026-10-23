# 《四季田园》第二阶段工程接口设计方案

> 版本：**PHASE2-INTERFACE-DESIGN-V1.2**（V1.1 基础上按 GPT 审核做 3 处微修订：stageOf 阶段映射明确化 / harvest 返回值含 tileId / ShopService 去除 Economy 依赖；架构与开发顺序不变）
> 上游：`docs/PHASE2-DESIGN-V2.md`（ChatGPT 设计文档 V2.0）
> 下游：审核（ChatGPT）→ 实现（DeepSeek）→ 集成/测试/验收（工程负责人）
> 本文件只做**接口与契约设计**，不含实现代码。所有类型均为 TypeScript 草案。

## 0. 设计决策（方案中的模糊点裁定）

| # | 模糊点 | 裁定 | 理由 |
|---|---|---|---|
| D1 | 作物成长触发时机 | `GameSession.sleep()` 内统一执行 `farming.tickDay()`，**只有睡觉推进日期时作物才生长** | 与现有 `TimeService` 单一推进入口一致；不引入游戏内实时时钟 |
| D2 | "当天浇水" 语义 | 浇水标记 `watered` 在**当日**置 true；下一次 `tickDay()` 时若 `watered===true` 则 `growthDay+1`，随后重置 `watered=false` | 与 GPT 示例（Day1 种 / Day2 浇 / Day3 成长）等价且无歧义 |
| D3 | 成熟阶段 | 阶段枚举 `Stage` **不落盘、不存储**，由 `growthDay + CropDefinition` 实时推导（`stageOf()`） | 减少状态、避免不一致；存档只存 `growthDay` |
| D4 | 工具切换 | 数字键 1–8 为物品快捷栏；第二阶段仅 `1=锄头 2=水壶`，选中后鼠标左键对**角色前方相邻格**使用 | 与 GPT 按键表一致 |
| D5 | 商店入口 | 第二阶段**不在地图放 NPC**，按 `B` 打开商店面板、`I` 打开背包面板 | 避免改 farm01 地图与既有测试；NPC 留待第三阶段 |
| D6 | 初始状态 | 新游戏：金币 500、背包初始含锄头×1 + 水壶×1（工具不可出售、不占格数限制例外：工具占格、stackable=false） | GPT 经济设计第 9 节 |
| D7 | 体力消耗 | 锄 5 / 水壶 2 只写入数据表字段 `energyCost`，**第二阶段无体力系统，不扣减** | GPT 原文即"记录不使用" |
| D8 | CropService vs FarmingService 分工 | `CropService`=纯作物规则（`stageOf`、单次 tick 判定、重复收获计算）；`FarmingService`=地块操作（till/plant/water/harvest/tickDay），**成长判定委托 CropService** | 两个服务职责不重叠，均可独立单测 |
| D9 | 收获入包失败 | 背包满且无法堆叠时，`harvest()` 返回 `fail` 原因 `INVENTORY_FULL`，**作物留在地里（仍可再次收获）**，不丢失 | 防止资产凭空消失 |
| D10 | 出售渠道 | `ShopService.sellCrop(itemId, amount)` 按物品 `sellPrice` 直接结算；种子**不可出售**（`category=Seed` 拒绝） | 保持商店面板单一入口 |

## 1. 数据模型（`src/domain/models/`）

本阶段新增模型文件：`Crop.ts` `Item.ts` `Inventory.ts` `Weather.ts` `Shop.ts` `Result.ts`（GPT 文档第 2 节列名不变，`Weather.ts`/`Shop.ts` 为其预留/商店接口补充）。

### 1.1 `Crop.ts`（新增，含 GPT 文档 3.1 的 CropState）
```ts
import type { Season } from "./types";

export type Stage = "seed" | "sprout" | "young" | "mature";
// mature = 可收获（对应 GPT 的 Mature/ Harvestable 合并，见 D3）

export interface CropDefinition {
  id: string;
  name: string;
  seasons: Season[];      // 适种季节列表（v1.1：支持多季作物/温室预留；播种不强制校验，仅影响商店展示，见 2.4）
  seedItemId: string;      // 对应物品表中的种子 item id（= crop id + "_seed"）
  seedPrice: number;       // 种子购买价
  growDays: number;        // 首次成熟所需成长天数
  yield: number;           // 单次收获产出数量
  sellPrice: number;       // 收获物出售单价
  repeatHarvest?: boolean;
  regrowDays?: number;     // 重复作物：收获后再次成熟所需天数（仅 repeatHarvest 时有效）
  energyCost?: number;
}

export interface CropState {
  cropId: string;
  growthDay: number;   // 已累计的成长天数
  harvestedCount: number; // 已收获次数（**仅 repeatHarvest 作物使用**；普通一次性作物不依赖该字段）
}

export interface FarmTileState {
  id: string;              // `${row}_${col}`，仅耕地格有状态
  tilled: boolean;         // 恒 true（只有耕地格会进此表），保留字段兼容 GPT 文档
  watered: boolean;       // 当日是否浇过水
  crop?: CropState;       // 未播种时无此字段
}
```

### 1.2 `Item.ts`
```ts
export enum ItemCategory {
  Seed = "seed",
  Crop = "crop",
  Material = "material",
  Tool = "tool",
  Special = "special",
}

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;        // 购买价（种子/工具）；收获作物此字段为 0
  sellPrice?: number;   // 可出售单价（作物）；未定义 = 不可出售
  stackable: boolean;
  maxStack: number;
  energyCost?: number;  // 工具（D7：只记录不消耗）
}

export interface InventorySlot {
  itemId: string;
  amount: number;
}

export interface InventoryState {
  capacity: number;      // 24
  slots: (InventorySlot | null)[]; // 长度恒 = capacity，空槽为 null（v1.1：类型与“空槽为 null”一致）
}
```

### 1.3 `Inventory.ts`（类型别名）
```ts
import type { InventorySlot } from "./Item";
export type Slot = InventorySlot | null;
export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
```
`Result` 统一放 `src/domain/models/Result.ts`，所有服务方法返回它，**禁止 throw 做流程控制**。

### 1.4 `Weather.ts`（预留，第二阶段只有接口）
```ts
export type WeatherType = "sunny" | "rain" | "cloudy";
export interface WeatherState {
  type: WeatherType;
  autoWater: boolean; // rain => true
}
export interface WeatherProvider {
  current(): WeatherState;
}
```

## 2. 数据表（`src/data/`）

### 2.1 `crops.ts` — 12 种作物，完整数值表（照抄 GPT 文档第 7/8 节）

> 勘误（GPT 已确认，2026-10-12）：作物表实际为 11 行（3春/3夏/3秋/2冬）；本节标题「12 种作物」与 §2.2 注释「12 种子」均为笔误，完整性计数应为「11 种子 + 11 作物 + 2 工具 = 24 项」。冻结数据 `src/data/crops.ts`（11 种）为准，不改。
```ts
import type { CropDefinition } from "../domain/models/Crop";
import type { Season } from "../domain/models/types";

export const CROPS: readonly CropDefinition[] = [
  // 春
  { id: "dew_radish",   name: "青露萝卜", seasons: ["spring"], seedItemId: "dew_radish_seed",   seedPrice: 10, growDays: 4,  yield: 1, sellPrice: 24 },
  { id: "morning_bean", name: "晨光豆",   seasons: ["spring"], seedItemId: "morning_bean_seed", seedPrice: 18, growDays: 6,  yield: 2, sellPrice: 20 },
  { id: "starberry",    name: "星芽莓",   seasons: ["spring"], seedItemId: "starberry_seed",    seedPrice: 35, growDays: 8,  yield: 1, sellPrice: 70, repeatHarvest: true, regrowDays: 3 },
  // 夏
  { id: "ember_tomato", name: "火绒番茄", seasons: ["summer"], seedItemId: "ember_tomato_seed", seedPrice: 25, growDays: 8,  yield: 3, sellPrice: 25 },
  { id: "blue_melon",   name: "蓝湾瓜",   seasons: ["summer"], seedItemId: "blue_melon_seed",   seedPrice: 40, growDays: 10, yield: 1, sellPrice: 110 },
  { id: "gold_corn",    name: "金穗玉米",  seasons: ["summer"], seedItemId: "gold_corn_seed",    seedPrice: 30, growDays: 12, yield: 2, sellPrice: 55 },
  // 秋
  { id: "amber_pumpkin", name: "琥珀南瓜", seasons: ["autumn"], seedItemId: "amber_pumpkin_seed", seedPrice: 45, growDays: 13, yield: 1, sellPrice: 150 },
  { id: "leaf_cabbage", name: "丰叶白菜", seasons: ["autumn"], seedItemId: "leaf_cabbage_seed", seedPrice: 20, growDays: 6,  yield: 2, sellPrice: 45 },
  { id: "moon_grape",   name: "月纹葡萄", seasons: ["autumn"], seedItemId: "moon_grape_seed",   seedPrice: 60, growDays: 10, yield: 2, sellPrice: 80 },
  // 冬
  { id: "snow_flower",  name: "雪晶花",   seasons: ["winter"], seedItemId: "snow_flower_seed",  seedPrice: 30, growDays: 8,  yield: 1, sellPrice: 90 },
  { id: "ice_grass",    name: "冰露草",    seasons: ["winter"], seedItemId: "ice_grass_seed",    seedPrice: 25, growDays: 7,  yield: 2, sellPrice: 55 },
] as const;

export function getCrop(id: string): CropDefinition | undefined;
export function getCropBySeed(seedItemId: string): CropDefinition | undefined;
```

### 2.2 `items.ts`
```ts
import type { ItemDefinition } from "../domain/models/Item";

export const ITEMS: readonly ItemDefinition[] = [
  // 工具
  { id: "hoe",      name: "锄头", category: ItemCategory.Tool, price: 0, stackable: false, maxStack: 1, energyCost: 5 },
  { id: "watering_can", name: "水壶", category: ItemCategory.Tool, price: 0, stackable: false, maxStack: 1, energyCost: 2 },
  // 12 种子 + 11 收获作物（starberry 重复收获但仍是独立作物 item）
  // 种子: { id: "dew_radish_seed", name: "青露萝卜种子", category: Seed, price: 10, stackable: true, maxStack: 99 }
  // 作物: { id: "dew_radish", name: "青露萝卜", category: Crop, price: 0, sellPrice: 24, stackable: true, maxStack: 99 }
] as const;

export function getItem(id: string): ItemDefinition | undefined;
```
**约束**：`CROPS` 与 `ITEMS` 由构建期一致性测试校验（每种作物必须有对应 seed 与 crop 两个 item，价格/sellPrice 与作物表一致）——防止两套表漂移。

### 2.3 `shops.ts`
```ts
import type { ShopItem } from "../domain/models/Shop";

/** NPC：禾木杂货铺。第二阶段 stock 无限（字段保留，恒 99999） */
export const SHOP_HOMU: {
  npcName: string;
  items: readonly ShopItem[];
} = { npcName: "禾木杂货铺", items: [ /* 12 种子 + 锄头 + 水壶，price 取 ITEMS，season 可空 */ ] };

export interface ShopItem { itemId: string; price: number; season?: Season; stock: number; }
```
（`ShopItem` 放 `domain/models/Shop.ts`）

## 3. 服务契约（`src/domain/services/`）

### 3.1 `CropService`（纯函数规则，无状态）
```ts
export class CropService {
  constructor(private readonly crops: readonly CropDefinition[] = CROPS) {}

  /**
   * 由 CropState 推导当前阶段（D3）。
   * 映射规则（V1.2 明确，实现不得自创比例，n = growDays）：
   *   growthDay < 1            → seed
   *   1 <= growthDay < n/2     → sprout
   *   n/2 <= growthDay < n     → young
   *   growthDay >= n          → mature（可收获；重复作物收获后 growthDay 归零进入 regrowDays 周期）
   * 例：growDays=4 → 0:seed，1:sprout，2~3:young，4:mature
   */
  stageOf(crop: CropState, def?: CropDefinition): Stage;
  /** 是否可收获 */
  isMature(crop: CropState, def?: CropDefinition): boolean;
  /**
   * 单日成长判定（纯判定，不修改入参，返回新 CropState）：
   * - 未成熟：watered ? growthDay+1 : growthDay
   * - 重复作物成熟后收获：重置 growthDay=0, harvestedCount+1
   * - 非重复作物：成熟后不再 +1
   */
  tick(crop: CropState, watered: boolean, def?: CropDefinition): CropState;
  /** 收获一次后：重复作物 growthDay 归零进入 regrowDays 周期 */
  afterHarvest(crop: CropState, def?: CropDefinition): CropState;
}
```

### 3.2 `FarmingService`（持有地块状态）
```ts
export class FarmingService {
  constructor(private readonly tiles: Map<string, FarmTileState>, private readonly crops: CropService) {}

  /** 开垦：地图草地格（场景层保证只允许对地图 soil/grass 格调用）→ 建 FarmTileState {tilled:true, watered:false} */
  till(tileId: string): Result;
  /** 播种：必须已开垦且无作物；不扣种子（种子扣除由 InventoryService 在组合调用里做，见 3.4 PlantAction） */
  plant(tileId: string, cropId: string): Result;
  water(tileId: string): Result;          // 必须已有 tilled 格；置 watered=true
  /** V1.2：返回值含 tileId（位置信息），供未来收获粒子/动画定位到指定格 */
  harvest(tileId: string): Result<{ tileId: string; cropId: string; amount: number; cropAfter: CropState | null }>;
  /** 每日推进（由 GameSession.sleep 调用，D1/D2）。v1.1：显式传入当前游戏日期 day，未来季节变化/任务/商店刷新需要日期来源 */
  tickDay(day: number, weather: WeatherState): void;   // 逐格：weather.autoWater 视为已浇水；调用 crops.tick；重置 watered
  /** 快照/恢复（存档用） */
  serialize(): Record<string, FarmTileState>;
  restore(data: Record<string, FarmTileState>): void;
}
```
失败原因码（字符串常量）：`NOT_TILLED` `ALREADY_HAS_CROP` `UNKNOWN_CROP` `NOT_MATURE` `UNKNOWN_TILE`。

### 3.3 `InventoryService`（持有背包状态，24 格）
```ts
export class InventoryService {
  constructor(capacity = 24) {}

  /** 加入物品：先堆叠同类（≤maxStack）再占空槽；满则失败 */
  add(itemId: string, amount: number): Result;
  remove(itemId: string, amount: number): Result; // 不足 → NOT_ENOUGH
  count(itemId: string): number;
  hasSpace(itemId: string, amount: number): boolean;
  /** 快捷栏：返回按槽位序前 8 格的 itemId（空为 null），场景层 1–8 键切换用 */
  hotbar(): (string | null)[];
  serialize(): InventoryState;
  restore(state: InventoryState): void;
}
```

### 3.4 组合动作（领域层，非场景层）——`FarmActions`
GPT 文档 16 节"使用工具"是跨服务的多步操作，拆成领域组合函数，**场景层只调这里**。
v1.1：改为**构造注入**（farming + inventory + economy + items 均在构造期注入），方法不再逐参传 EconomyService，保持可测试：
```ts
// src/domain/services/FarmActions.ts
export interface FarmActionsDeps {
  farming: FarmingService;
  inventory: InventoryService;
  economy: EconomyService;   // 注入项，仅构造期传入
  items: readonly ItemDefinition[];
}
export function createFarmActions(deps: FarmActionsDeps): FarmActions;

export interface FarmActions {
  /** 锄：对目标格 till；工具由场景层保证已选中 */
  till(tileId: string): Result;
  /** 播种：inventory.remove(种子) 成功后 farming.plant；失败则回滚不扣 */
  plant(tileId: string, seedItemId: string): Result;
  /** 浇水 */
  water(tileId: string): Result;
  /** 收获：farming.harvest 成功 → inventory.add(作物, yield)；背包满 → 保留地里（D9） */
  harvest(tileId: string): Result;
  /** 出售：inventory.remove + 注入的 economy.addGold(sellPrice*amount)；种子拒绝（D10） */
  sell(itemId: string, amount: number): Result;
}
```

### 3.5 `ShopService`（V1.2：商店不依赖 EconomyService，改为注入 items + 传裸 gold，保持纯）
```ts
export class ShopService {
  constructor(
    private readonly shop: { npcName: string; items: readonly ShopItem[] },
    private readonly items: readonly ItemDefinition[],
  ) {}

  /** 按季节过滤可售商品；affordable = gold >= price*qty（默认 qty=1） */
  list(gold: number, season: Season): readonly { item: ItemDefinition; price: number; affordable: boolean }[];
  /** 买：先校验 gold 是否足够 + 背包是否有位置；返回 {ok,value:{amount, goldLeft}}；
   *  失败原因 GOLD_SHORT / INVENTORY_FULL。扣款不入 domain（调用方以 goldLeft 结算 EconomyService） */
  buy(itemId: string, amount: number, gold: number, inventory: InventoryService): Result<{ amount: number; goldLeft: number }>;
}
```
> 依赖链约束（V1.2）：`EconomyService` ← `GameSession` 持有；`ShopService` 只读裸 gold 数值，不得 import/持有 Economy 实例。

## 4. `GameSession` 扩展（`src/game/systems/GameSession.ts`）

新增字段（保持模块单例模式）：
```ts
export interface GameSession {
  // …现有 time / economy / save
  farming: FarmingService;
  crops: CropService;
  inventory: InventoryService;
  shop: ShopService;         // V1.2：new ShopService(SHOP_HOMU, ITEMS) 构造注入
  weather: WeatherProvider;        // 第二阶段返回常量 sunny（预留）
  actions: FarmActions;      // v1.1：由 createFarmActions({ farming, inventory, economy, items }) 构造注入

  /** 睡觉：① time.advanceDay ② farming.tickDay(time.date.day, weather.current()) ③ 存档（见 5.2） */
  sleep(): DateInfo;

  /** 新游戏：金币 500、背包初始 [hoe×1, watering_can×1]、地块清空（D6） */
  newGame(): void;
  /** 载入存档 v1/v2 */
  loadGame(): boolean;
}
```
**红线（GPT 第 2 节）**：场景层只读 `session.*` 展示，所有写操作必须经 `session.actions.*` / `session.shop.*` / `session.sleep()`。

## 5. 存档 V2 与迁移（`src/persistence/save.ts`）

### 5.1 数据结构
```ts
export interface SaveDataV2 {
  version: 2;
  gold: number;
  day: number;
  farmTiles: Record<string, FarmTileState>;
  inventory: InventoryState;
  weather: WeatherState;
}
// SaveData = SaveDataV1 | SaveDataV2（判别字段 version）
```
### 5.2 迁移（纯函数，可单测）
```ts
export function migrateSave(raw: unknown): SaveDataV2 | null;
// v1 → { version:2, gold, day, farmTiles:{}, inventory: 初始24空格(hoe+watering_can), weather: {type:"sunny",autoWater:false} }
// 损坏/未知版本 → null
```
`SaveManager.load()` 内部调用 `migrateSave`，返回类型统一为 `SaveDataV2`。

## 6. 场景层改动契约（`src/game/`，DeepSeek 实现时遵守）

1. **`FarmScene` 交互**（不新增文件，改 FarmScene + 新增 UI 面板）：
   - 选中工具 = `inventory.hotbar()[selectedSlot]`；数字键 1–8 切换
   - 目标格 = 角色面向方向相邻 1 格（`facing` 由最近移动方向得出，存入 Player）
   - 鼠标左键：`actions` 对应方法（hoe→till / seed→plant / watering_can→water）
   - 按 E：若目标是作物格且成熟 → `actions.harvest`；若目标是床 → 现有睡觉流程
   - 按 I：`InventoryPanel`（Phaser 面板，24 格网格 + 数量）
   - 按 B：`ShopPanel`（禾木杂货铺：按当前季节过滤展示、EconomyService 余额、Enter/点击购买）
   - 两个面板打开时**暂停角色输入**（场景级 flag），面板内 Esc 关闭
2. **作物渲染**：`PlaceholderAssets` 新增 4 个通用阶段纹理 `crop_seed/sprout/young/mature`，按作物色板着色（占位）；每帧 diff `farming` 快照变化格才刷新对应 tile 上作物图（性能红线：禁止全图重绘）
3. **HUD 增量**：增加"当前工具"显示 + 选中格高亮
4. 地图 farm01 **不改**（D5）

## 7. 测试契约（`tests/`，每个服务独立用例）

| 文件 | 必测（对应 GPT 第 15 节） |
|---|---|
| `tests/crop.test.ts` | stageOf 阶段推导；tick 浇水+1 / 未浇水不动；重复收获 regrowDays；非重复成熟封顶 |
| `tests/farming.test.ts` | 开垦成功/已开垦幂等；播种成功/草地禁播/无作物禁播(UNKNOWN_TILE)；浇水成功/未开垦失败；收获成功入参后状态/未成熟禁收/重复收获 |
| `tests/inventory.test.ts` | 堆叠/占新格/满包失败/扣款不足 NOT_ENOUGH/hotbar 前 8 格 |
| `tests/shop.test.ts` | V1.2：以裸 gold 数值入参——gold 不足 GOLD_SHORT；包满 INVENTORY_FULL；成功返回 {amount, goldLeft}+入包；种子不可售（CROPS↔ITEMS 一致性校验） |
| `tests/actions.test.ts` | 播种原子性（包空回滚）；收获背包满作物留地；卖出金币累加 |
| `tests/save-v2.test.ts` | v1→v2 迁移字段齐全；v2 往返；坏数据 null |
| `tests/data-integrity.test.ts` | CROPS ↔ ITEMS 一致性（24 个 item 存在、价格一致） |

## 8. DeepSeek 实现任务单（按 GPT 17 节开发顺序拆分）

| 任务 | 交付 | 验收 |
|---|---|---|
| T1 (Phase 2.1) | `models/Crop.ts` `CropService` `FarmingService` + `tests/crop` `tests/farming` | 用例全绿 |
| T2 (Phase 2.2) | `models/Item.ts` `data/items.ts` `InventoryService` + 测试 | 用例全绿 |
| T3 (Phase 2.3) | `data/crops.ts` `data/shops.ts` `ShopService` `FarmActions` + 测试 | 用例全绿 |
| T4 (Phase 2.4) | GameSession 扩展 + FarmScene 交互 + 两个面板 + 占位作物纹理 | 浏览器走通"买→种→浇→收→卖"闭环 |
| T5 (Phase 2.5) | SaveDataV2 + `migrateSave` + saveGame/loadGame 改造 + 测试 | 旧 v1 存档可载入 |

**顺序强制**：T1→T5 串行；每个 T 完成后工程负责人跑 `tsc --noEmit && vitest run && vite build` 三件套，任一红不放行。

## 9. 不做（Out of Scope，防止膨胀）

- 天气随机事件（只有 sunny 常量 + 接口）
- 体力扣减、NPC 立绘、地图扩充、种植季节限制（数据已就位，规则不启用）
- 种子多日分批购买、库存 stock 消耗（恒 99999）
- 正式美术（全部占位）
