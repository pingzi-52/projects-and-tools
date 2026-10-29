# projects-and-tools

简历上那几个项目的完整源码，加上平时攒的工具、skill 和 agent 定义，收在一个私有仓库里。

**这个仓库里没有的东西**：公司内部数据、内部系统地址、标注平台账号口令、任何 API Key 明文。
所有原本硬编码在脚本里的 key 都已改成从环境变量读取（见每个工具目录下的 `README`/`.env.example`）。

## 目录

| 路径 | 内容 |
| --- | --- |
| [`resumes`](resumes) | 两份优化简历：Word、PDF 与 Markdown |
| [`projects/lingjing-archive`](projects/lingjing-archive) | 灵境档案 · 林缘农场（浏览器 2D 农场经营游戏） |
| [`projects/annoqa`](projects/annoqa) | AnnoQA：标注规范问答服务 |
| [`projects/3d-solar-system`](projects/3d-solar-system) | 可点击的 three.js 太阳系 / 3D 交互 demo |
| [`tools/data-pipeline`](tools/data-pipeline) | 多模态数据生产脚本（模型调用、批量处理、视频生成） |
| [`tools/ai-agent`](tools/ai-agent) | 自己写的 AI agent 框架（工具注册、多后端路由、视觉/浏览器工具） |
| [`agents`](agents) | 13 个 agent 的 Markdown 定义 |
| [`skills`](skills) | 40 个自建 skill（Markdown + scripts/templates/references） |

## 项目

### projects/lingjing-archive — 灵境档案 · 林缘农场

原创 2D 浏览器农场模拟经营游戏。农场、林缘森林、溪桥镇三块地图，可种田、交易、钓鱼、每日采集、完成居民委托、做饭和做提灯，带完整存档、游戏时钟、体力、天气与昼夜变化。

- 技术栈：TypeScript + Vite + Vitest，Canvas 2D 渲染，逻辑分辨率固定 512×384
- 结构上把玩法规则抽到领域层（纯函数、可单测），状态收敛到单一 `GameSession`，渲染只读状态
- 存档格式一路从 V1 迭代到 V7，新版本能读老存档
- 65 个测试文件、961 项自动化测试通过；`vitest` 跑单测，`npm run build` 出生产包
- `TASK_PROGRESS.md` 和 `docs/` 里是逐轮的实机验收记录（改了什么、怎么验的、哪些没验）

```bash
cd projects/lingjing-archive
npm install
npm run dev      # 本地开发
npx vitest run   # 跑测试
```

### projects/annoqa — AnnoQA 标注规范问答服务

把标注规范文档切块、建索引、做成能问的服务。默认走纯检索（TF-IDF 关键词打分 + top-k），配了 key 才接大模型做生成。

- 技术栈：FastAPI + pytest，CLI 与 Web 两个入口
- 44 项测试通过：切块 9 / 排序 14 / LLM 降级 9 / 接口若干
- 没配 key 或模型调用失败时自动降级为纯检索，不会抛异常
- 检索靠关键词命中，没引入向量库和 embedding —— 这是刻意的取舍，不是没做完

```bash
cd projects/annoqa
pip install -r requirements.txt
python -m annoqa serve        # 起 Web 服务
pytest                        # 跑测试
```

### projects/3d-solar-system — 可点击的 3D 场景

三个交付物：5 个交互目标的点击 demo、9 个可点天体的太阳系、以及单文件双击即开的离线版。

- 技术栈：three.js + esbuild + Remotion
- 行星纹理用 canvas 程序化生成（条带 + 湍流斑块 + 陨石坑），不下载贴图；轨道距离取真实值后压缩映射：`dispDist = 6.0 * pow(a, 0.60) + 1.9`
- 单文件 HTML 1.8 MB，双击就能看，断网可跑
- 验收不是靠肉眼看截图，是用 CDP 派发真实鼠标事件（`Input.dispatchMouseEvent`）逐点验证命中
- `web/solar-standalone.html` 直接双击；用 Remotion 渲染的演示视频产物没进仓库（35 MB）

### 太阳系升级记录（2026-10-26）

太阳系已同步为“深空观测图鉴”版本：暖白铜金界面、确定性细节材质、薄大气、细环与环影，修正环面倾角和自转轴；保留九天体选择、镜头跟随及离线单文件。新增模块与测试均在原项目目录。

- 验证于 2026-10-26：38 项 Node 测试、HTTP/file 双模式 70 项浏览器检查通过；本次上传核对文件哈希，未重新进行全套实机验收。
- [项目说明](projects/3d-solar-system/README.md) · [验证范围](projects/3d-solar-system/VERIFICATION.md) · [画面预览](projects/3d-solar-system/docs/preview-saturn.png)
- 表面纹理属于程序化艺术表达，地球大陆并非真实地理地图；不是精确天文模拟。

## 工具

### tools/data-pipeline

平时做多模态数据生产时写的脚本：豆包/多模态模型客户端、批量修图、小说转视频（两版）、视觉辅助、作业脚本。
模型地址与 key 全部走环境变量：`DEEPSEEK_KEY` / `ARK_API_KEY` / `AGNES_API_KEY` 等。

### tools/ai-agent

一个自己写的 agent 运行时：工具注册与分派（`tools/__init__.py` 里按模块合并 `TOOLS` 并路由）、多后端模型路由、文件/网页/浏览器/视觉工具、简单的学习与记忆模块。

## agents / skills

- `agents/`：13 个 agent 的 Markdown 定义（frontmatter + 触发示例），复制到 `~/.claude/agents` 之类的目录就能用
- `skills/`：40 个自建 skill，每个目录一份 `SKILL.md`，重的还带 `scripts/`、`templates/`、`references/`

## 说明

- 公司相关的东西一律没放进来：标注平台的操作脚本、内部系统域名、测试用账号口令、以及围绕它们的浏览器验收脚本
- 大件产物也没放：`node_modules`、`dist`、Remotion 渲染出的 mp4、浏览器用户目录
- 仓库是私有的，代码仅供自己备份与面试展示，没有加开源许可证

