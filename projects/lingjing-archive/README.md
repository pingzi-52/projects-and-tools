# 灵镜档案 · 林缘农场

原创 2D 浏览器农场模拟经营游戏。当前本地小型测试版包含农场、林缘森林与溪桥镇，可种田、交易、钓鱼、每日采集、完成三位居民及池边的四项一次性委托、制作菌菇餐与农场提灯。保留完整存档、农舍木箱、游戏时钟、体力、天气和昼夜变化。

2026-10-20 开发备份已上传私有GitHub：最新版本使用 `feature/beta-guidance` 分支，`main` 保留10月16日快照。换电脑请按下面命令克隆指定分支，或在GitHub先切换到此分支再选择 **Code → Download ZIP**。上传结果见[本次GitHub交接](docs/handoff-2026-10-20-github.md)。

测试版范围、试玩顺序、验证与限制见 [docs/SMALL_BETA.md](docs/SMALL_BETA.md)。这是本地玩法测试版，未对外发布。

2026-10-20 后续新增[池塘打磨与第一尾委托](docs/POND_POLISH.md)：F池边先准备再下竿；芦苇/睡莲/游鱼与更明确的钓鱼反馈；任意鱼1尾换60金的一次性委托。V7兼容V1–V6，区域手记显示进度；65文件961测试、正式构建与实际钓鱼/交付通过。本轮及此前累计进度已包含在开发分支备份。

以下为历史开发记录，其中“当时未提交/推送”的工作已随本次备份上传。

2026-10-20 前一阶段新增[池畔钓鱼](docs/FISHING_BETA.md)：到东南池塘岸边按F下竿，咬钩后提竿，指针在绿区收线3次。两种原创鱼图标、鱼获背包/保存/出售、失败/取消免费已接入；59文件916测试和正式构建通过，实际日纹鲤钓获/读档/出售与键盘取消通过。逻辑512×384保持，窄窗口完整等比显示。试玩仍仅本地，尚未提交或推送。

2026-10-19 本地新增：任务/采集引导、居民眨眼与近距招手、独立工坊/会馆，以及森林局部资源空地、采集岔路和遮人树木渐隐。说明见 [任务引导](docs/BETA_GUIDANCE.md)、[居民和建筑](docs/RESIDENTS_AND_TOWN.md) 与 [森林可读性](docs/FOREST_READABILITY.md)。原目录851项测试与生产构建通过。森林遮挡处理之外，本轮还完成探索提示暂停修复、两行任务卡、统一反馈栏与小镇前坪，见[当前版本打磨](docs/VERSION_POLISH.md)。真实长暂停、采集、居民交互和三区行走已验收。另完成[农场与森林构图第一轮](docs/ENVIRONMENT_COMPOSITION.md)：道路留白、疏密花簇与三处林间空地，已实机行走/采集，开垦遮饰已通过空格同处理器补验，鼠标画布输入本身仍待实测。所有本地新改动尚未提交或推送，GitHub备份不会自动包含。

2026-10-19 后续完成[界面与工具反馈打磨](docs/UI_AND_TOOL_POLISH.md)：三区木框统一、空格使用工具、农场提示暂停保留，851项测试与正式构建通过；两处花草格实际开垦/浇水/播种、三区行走、读档和长暂停已验证。鼠标画布点击与强制Canvas像素效果仍未新增实测。本轮及此前工作仍仅本地未提交/推送。

换电脑继续开发先读 [最新交接](docs/handoff-2026-10-20-github.md) 和 [项目上下文](docs/PROJECT_CONTEXT.md)。本机验证环境为 Node.js 24.16.0、npm 11.13.0，依赖版本由 package-lock.json 固定。

```bash
git clone --branch feature/beta-guidance https://github.com/pingzi-52/lingjing-farm.git
cd lingjing-farm
npm ci
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

打开 http://127.0.0.1:5175/index.html 。私有仓库需要使用有权限的 GitHub 账号登录。素材已包含，无需重新下载；浏览器中的个人游玩存档不随源码同步，另见交接文档。

也可以登录 GitHub 后，在仓库页选择 **Code → Download ZIP**，解压后从 `npm ci` 开始。该方式包含全部开发文件和素材，但不含 Git 提交历史。

- 精致现代像素风，Phaser 3 + TypeScript + Vite
- 目标平台：桌面浏览器（Chrome / Edge 优先），单人游玩
- 本地存档：localStorage，无后端、无账号系统

> 当前环境使用 Cainos 免费素材与原创生成补件。农舍已接入，可进屋睡觉和使用24格储物箱；角色已统一四方向动作，三种春季作物有独立生长阶段及干湿耕地；其他季节和部分界面仍待统一。

一天经营节奏与验收见 [docs/MILESTONE_3_DAILY_LIFE.md](docs/MILESTONE_3_DAILY_LIFE.md)。

商人、对话与首份收成委托见 [docs/MILESTONE_3_MERCHANT.md](docs/MILESTONE_3_MERCHANT.md)。

统一工具/物品图标、操作声与声音设置见 [docs/MILESTONE_2_FEEDBACK.md](docs/MILESTONE_2_FEEDBACK.md)。

自主推进路线见 [docs/AUTONOMOUS_ROADMAP.md](docs/AUTONOMOUS_ROADMAP.md)，人物与春季作物验收见 [docs/MILESTONE_2_VISUALS.md](docs/MILESTONE_2_VISUALS.md)，农舍验收见 [docs/MILESTONE_2_HOME.md](docs/MILESTONE_2_HOME.md)，经营底座见 [docs/MILESTONE_1_PLAYABLE.md](docs/MILESTONE_1_PLAYABLE.md)。

## 安装

```bash
npm ci
```

## 开发运行

```bash
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

打开 http://127.0.0.1:5175/index.html 。保持相同主机名和端口，避免同机浏览器因 origin 不同而显示另一份本地存档。

## 操作

| 按键 | 功能 |
|---|---|
| W / A / S / D 或 方向键 | 移动角色 |
| E | 与田边禾木交谈；农舍门前进入；室内床旁睡觉 / 木箱旁存取 / 门口出屋；田里收获 |
| Q | 农场任务手记；靠近禾木可领取种子与交付首份收成 |
| L | 只读区域手记：查看方位、所在区域和四项委托状态 |
| F | 农场池边打开准备与首次钓鱼委托；窗口中再次按F开始/提竿/收线 |
| K | 随身制作菌菇餐 / 农场提灯，也可吃饭恢复体力 |
| M | 声音设置：静音、操作/风雨音量、试听；标题与室内也可打开 |
| T | 回到标题界面 |
| Enter | 标题界面继续/开始游戏 |
| N | 标题界面新游戏 |
| B / I | 集市 / 背包；菜单打开时暂停农场 |
| Esc | 关闭对话、手记、集市或背包 |
| 1–8 / 左键 | 选择快捷栏 / 使用工具或种子 |
| R | 标题界面恢复上一份有效存档 |

背包前8格为快捷栏；后排物品点选后，再点前8格可交换。收获物和采集材料可在背包出售。V7存档额外保存一次性钓鱼委托，并保存金币、日期、时刻、体力、背包、储物箱、耕地、作物、三位居民委托、每日已采集点和永久提灯；V1至V6兼容读取，写入升级前备份。已有存档时，新游戏需要再次按N确认。刷新后从农场继续，区域位置不持久化。

出生点东侧找到禾木，靠近按E领取3颗当季种子。每天照料后回小屋休息，收获后交付指定作物1份，获得120金，余下收成保留。任务不重复领奖，无期限。对话和Q手记暂停农场；若旧田占满商人全部候选位置，Q改用便笺联络，不删除旧田。

从农场西侧林间路步行到森林找岚：3野蘑菇换80金；从农场东侧乡道步行到溪桥镇找阿榆：6树枝和4溪石换140金与提灯配方。经过路口自动保存，短暂淡出后从相应入口进入；顺来路返回。室内先正常出屋，L仅查看区域和委托。森林9个点每日各采一次，每次2体力，睡觉恢复；2野蘑菇做1份餐，吃后恢复25体力。提灯需完成阿榆委托，再花4树枝和3溪石，只建一次。委托和制作从随身背包扣材料，失败保存会回滚。

区域衔接设计与本轮验收范围见 [docs/WALKING_AREAS.md](docs/WALKING_AREAS.md)；旧菜单出行的五日验收仅证明经营流程，步行版以本轮独立证据为准。

每天06:00开始，活动7秒推进10分钟，22:00停钟；床睡觉才进入次日并恢复100体力。菜单、标题和后台暂停。开垦/浇水/播种成功消耗2/2/1体力，重复已耕/已湿免费，收获和移动免费。雨天自动浇水；重载不重掷天气。

首次按键/点击后启用声音。操作声与轻量风雨声可分别调节，暂无背景音乐；设置独立保存，不改变游戏存档。后台和菜单暂停环境声。快捷栏显示1–8标号、堆叠数量及统一物品图标。

农舍通常位于北侧主路尽头，旧存档若已种植对应空地，房屋会避让到其他预留位置；所有候选已被种植时，原休息点保留为小屋入口。屋内木箱两边各24格，可存取1件或全部，保存失败会还原物品。菜单打开时场景暂停。

独立美术预览：`showcase.html?style=cainos-farm`；农舍候选：`showcase.html?style=cainos-home`。

## 测试

```bash
npm test          # 单次执行（Vitest）
npm run test:watch
```

覆盖领域层：时间（季节/天数）、经济（金币）、存档（序列化/损坏数据）、地图（尺寸/边界/通行性）、会话（跨场景状态一致性）。

## 生产构建

```bash
npm run build     # tsc 类型检查 + vite build，产物在 dist/
npm run preview   # 本地预览 dist/
```

## 目录结构

```
src/
├─ main.ts               入口：挂载 Phaser 游戏
├─ game/
│  ├─ config.ts          全局常量（TILE、场景键、视野）
│  ├─ createGame.ts      Phaser 实例创建 + 场景注册
│  ├─ scenes/            Boot / Title / Farm 场景
│  ├─ entities/          Player（角色）
│  └─ systems/
│     ├─ GameSession.ts  跨场景共享状态（单一事实源）
│     └─ placeholderAssets.ts  程序化占位像素素材
├─ domain/
│  ├─ models/            数据模型类型（日期/季节/存档）
│  └─ services/          TimeService / EconomyService（纯逻辑）
├─ data/maps/farm01.ts   原创「青禾农庄」地图（36×24）
├─ persistence/save.ts   localStorage 存档管理器
├─ ui/                   UI 层预留接口
└─ styles/               全局样式
tests/                   Vitest 单元测试
```

## 架构约定

- 游戏规则在 `domain/services`（纯逻辑可单测），**不写在 UI 事件回调里**
- 金币 / 日期等状态只存在于 `GameSession`（模块级单例），场景切换不重置
- 场景只读取会话状态做表现，不持有权威数值

## 继续开发

先按 [跨电脑交接](docs/handoff-2026-10-20-github.md) 在新电脑完成安装、测试和试玩，再处理地图可读性、居民动作及其他季节素材。种植、背包、交易和 V7 兼容存档已经实现，当前状态以 [PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) 和 [TASK_PROGRESS.md](TASK_PROGRESS.md) 顶部记录为准。
