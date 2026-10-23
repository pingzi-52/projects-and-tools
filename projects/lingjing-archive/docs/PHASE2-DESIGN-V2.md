# 《四季田园》第二阶段游戏设计文档 V2.0（ChatGPT 出品，存档备份）

> 版本：2.0 ｜ 阶段：农业系统与经济循环开发
> 目标：建立第一个完整可玩的农场经营循环
> 本文档为外部方案原文存档，接口落地设计见 `PLAN-PHASE2-INTERFACES.md`。

## 1. 第二阶段目标

第二阶段完成目标：玩家能够 购买种子 → 整理土地 → 播种 → 浇水 → 等待成长 → 收获 → 进入背包 → 出售 → 获得金币 → 购买更多种子。
完成后游戏拥有第一个完整 Gameplay Loop。

## 2. 系统架构

新增模块：
```
src/domain/models/    CropState.ts  FarmTileState.ts  Item.ts  Inventory.ts
src/domain/services/  FarmingService.ts  CropService.ts  InventoryService.ts  ShopService.ts
src/data/             crops.ts  items.ts  shops.ts
```

架构规则：
1. 游戏规则只能存在 domain 层。
2. Phaser Scene 不直接修改金币/背包/作物/日期。
3. 所有状态通过 GameSession 管理。
4. 所有服务必须支持 Vitest 单元测试。

## 3. 农业系统

### 3.1 土地状态
```ts
interface FarmTileState {
  id: string;
  tilled: boolean;
  cropId?: string;
  growthDay: number;
  watered: boolean;
  lastUpdateDay: number;
}
```

土地流程：草地 → 锄地（耕地）→ 播种（幼苗）→ 成长 → 成熟（可收获）→ 收获（空耕地）

## 4. 工具系统

| 工具 | 功能 | 体力消耗 |
|---|---|---|
| 锄头 | 开垦土地 | 5 |
| 水壶 | 浇水 | 2 |

（体力系统第二阶段不实现，消耗值先记录不使用）

锄头规则：目标必须为草地，grass → tilled soil。
水壶规则：目标必须是耕地或已有作物，watered=true。

## 5. 浇水规则（每日浇水制）

当天浇水：作物正常成长；当天未浇水：当天停止成长。
示例（萝卜 4 天成熟）：正常 Day1 种植 / Day2 成长 / Day3 成长 / Day4 成熟；缺水 Day2 不成长、Day3 成长。

## 6. 作物成长阶段

统一：Seed → Sprout → Young → Mature → Harvestable（由 growthDay 推导，不单独存储）

## 7. 作物数据库

### 春季
| 名称 | ID | 种子价格 | 成长天数 | 产量 | 售价 |
|---|---|---|---|---|---|
| 青露萝卜 | dew_radish | 10 | 4 | 1 | 24 |
| 晨光豆 | morning_bean | 18 | 6 | 2 | 20 |
| 星芽莓 | starberry | 35 | 8 | 1 | 70 |

### 夏季
| 名称 | ID | 种子价格 | 成长天数 | 产量 | 售价 |
|---|---|---|---|---|---|
| 火绒番茄 | ember_tomato | 25 | 8 | 3 | 25 |
| 蓝湾瓜 | blue_melon | 40 | 10 | 1 | 110 |
| 金穗玉米 | gold_corn | 30 | 12 | 2 | 55 |

### 秋季
| 名称 | ID | 种子价格 | 成长天数 | 产量 | 售价 |
|---|---|---|---|---|---|
| 琥珀南瓜 | amber_pumpkin | 45 | 13 | 1 | 150 |
| 丰叶白菜 | leaf_cabbage | 20 | 6 | 2 | 45 |
| 月纹葡萄 | moon_grape | 60 | 10 | 2 | 80 |

### 冬季
| 名称 | ID | 种子价格 | 成长天数 | 产量 | 售价 |
|---|---|---|---|---|---|
| 雪晶花 | snow_flower | 30 | 8 | 1 | 90 |
| 冰露草 | ice_grass | 25 | 7 | 2 | 55 |

## 8. 重复收获作物（当前：星芽莓）

```json
{ "repeatHarvest": true, "firstGrowth": 8, "regrowDays": 3 }
```
第一次成熟 8 天，之后每 3 天再次产出。

## 9. 初始经济设计

玩家初始：金币 500，拥有锄头 + 水壶。
第一次盈利示例：买 20 个青露萝卜种子（200）→ 收获 20×24=480 → 利润 280 → 资产 780。

## 10. 经济节奏目标

| 节点 | 目标 | 金币 |
|---|---|---|
| 第 7 天 | 第一次盈利 | 800–1000 |
| 第 14 天 | 40 块耕地 | 1500–2500 |
| 第 30 天 | 稳定农场 | 5000+ |

## 11. 背包系统

容量 24 格。

```ts
enum ItemCategory { Seed, Crop, Material, Tool, Special }

interface ItemDefinition {
  id: string; name: string; category: ItemCategory;
  price: number; stackable: boolean; maxStack: number;
}

interface InventoryState { slots: InventorySlot[]; }
interface InventorySlot { itemId: string; amount: number; }
```

## 12. 商店系统

NPC：禾木杂货铺。第二阶段功能：购买种子、查看价格。

```ts
interface ShopItem { itemId: string; price: number; season: string; stock: number; }
```

购买流程：点击商品 → ShopService.buy() → 检查金币 → 扣除 → 入背包。

## 13. 天气系统（预留）

类型：Sunny / Rain / Cloudy；Rain 自动浇水。第二阶段只建接口。

## 14. Save V2 设计

```json
{ "version": 2, "gold": 0, "day": 0,
  "farmTiles": {}, "inventory": {}, "crops": {}, "shops": {}, "weather": {} }
```
迁移：version=1 旧存档 → SaveMigration 补默认字段 → version=2。

## 15. 测试要求（FarmingService）

1. 开垦：草地格 → tilled=true
2. 播种：空耕地 + 种子 → cropId 存在
3. 浇水成长：watered=true 且 advanceDay() → growthDay+1
4. 未浇水：growthDay 不增加
5. 收获：背包增加作物，土地恢复空耕地
6. 禁止行为：草地播种 / 无种子播种 / 未成熟收获 / 重复收获

## 16. 玩家操作

| 功能 | 按键 |
|---|---|
| 移动 | WASD |
| 互动 | E |
| 使用工具 | 鼠标左键 |
| 切换物品 | 数字键 1–8 |
| 背包 | I |
| 睡觉 | E |

## 17. 开发顺序

- Phase 2.1 农业核心：CropDefinition / FarmTileState / FarmingService / 成长逻辑
- Phase 2.2 背包：InventoryService / Item 系统
- Phase 2.3 商店：ShopService / 买种子
- Phase 2.4 游戏连接：Phaser 交互 / UI 显示
- Phase 2.5 存档升级：Save V2

最终验收：✅ 买种子 ✅ 种植 ✅ 浇水 ✅ 等待成长 ✅ 收获 ✅ 存入背包 ✅ 出售 ✅ 获得金币 ✅ 保存读取
