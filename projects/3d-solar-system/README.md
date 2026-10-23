# 可点击的 3D 动画 — 三个交付物

三样东西，都验证过：

| 交付物 | 路径 | 说明 |
| --- | --- | --- |
| **点击交互 demo（网页）** | `web/index.html` | 5 个目标，three.js 实时渲染，断网可跑 |
| **太阳系（网页）** | `web/solar.html` | 9 个可点天体，真实轨道数据压缩映射 |
| **太阳系（双击即开）** | `web/solar-standalone.html` | 同上，单文件 1.8 MB，不需要服务器 |
| 视频 | `out/pointer-demo.mp4` | 1920×1080 / 30fps / 13s，Remotion 渲染 |

## 跑起来

**最省事：双击 `web/solar-standalone.html`**，直接就能看、能点。

其余网页版用了 ES module importmap，`file://` 打开会被浏览器的 CORS 策略拦住
（`origin 'null'`），所以需要静态服务器：

```powershell
cd web
npx --yes http-server -p 4321 -c-1
```

- 点击 demo → <http://127.0.0.1:4321/index.html>
- 太阳系 → <http://127.0.0.1:4321/solar.html>

`web/vendor/three.module.js` 是本地副本（three r186），断网也能跑。

改完 `solar.html` 后重新生成单文件版：

```powershell
node scripts/build-standalone.cjs
```

视频版：

```powershell
npx remotion render PointerDemo out/pointer-demo.mp4 --codec=h264 --crf=18
```

> 渲染若报 `Permission denied` 写临时文件，先把 `$env:TMP` / `$env:TEMP` 指到工程内再渲染。

---

## 1. 点击 demo（`web/index.html`）

- **悬停** — 目标高亮放大、描边变色、3D 准星吸附、粒子场被吸引
- **点击** — 冲击波扩散、粒子炸开、中心大字闪出对应指令、左上角日志追加一条
- **拖拽** — 旋转视角；**滚轮** — 拉近拉远（半径 9–30）

可点目标 5 个：4 个环绕八面体（ORBIT / ARRAY / FIELD / LOCK）+ 中心核心（CORE）。

## 2. 太阳系（`web/solar.html`）

太阳 + 八大行星，全部可点，点开右侧资料面板（直径、半长径、公转/自转周期、卫星数、表面温度）。

- **点击天体** — 镜头推进到该天体，信息面板滑入，选中环亮起
- **拖拽 / 滚轮** — 轨道相机自由观察
- **暂停 / 1× / 4× / 16×** — 时间流速
- **复位视角** — 回到全景；**ESC** — 取消选中
- 空格暂停

轨道数据取自真实值，再用压缩映射适配画面：

```js
const dispDist  = (a) => 6.0 * Math.pow(a, 0.60) + 1.9;      // 半长径 AU → 显示单位
const dispRadius = (km) => 0.62 * Math.pow(km / 12742, 0.42); // 直径 km → 显示半径
const dispSpeed = (period) => 0.42 * Math.pow(365.25 / period, 0.42);
```

行星表面纹理是 canvas 程序化生成的（条带 + 湍流斑块 + 陨石坑），不依赖任何贴图文件。

## 3. 视频（`out/pointer-demo.mp4`）

```
src/
  Root.tsx          # 注册 Composition（1920×1080, 30fps, 390 帧）
  PointerDemo.tsx   # 时间轴：镜头运动 + 3 次「点击」的编排
  scene.tsx         # 3D 场景：核心、环绕体、粒子、光标、冲击波
```

---

## 验证

两个网页都用 CDP 派发**真实鼠标事件**（`Input.dispatchMouseEvent`），不是调 JS 函数：

| 脚本 | 目标 | 结果 |
| --- | --- | --- |
| `scripts/verify-web.cjs` | 点击 demo 的 5 个目标 | **5/5** 通过 |
| `scripts/verify-solar.cjs` | 太阳系的 9 个天体 | **9/9** 通过 |

太阳系脚本对每个目标做闭环瞄准（最多 24 次：投影 → 移鼠标 → 等 70ms → 读 `hovered`），
再派发按下/抬起，并记录 `pressed / released / used` 三个诊断值确认命中的是同一个天体。

截图：`out/web-click-core.png`、`out/web-idle.png`、`out/solar-system.png`、
`out/solar-saturn.png`、`out/solar-jupiter.png`。

## 踩过的坑

- **轨道上的小球太难点中**：八面体在屏幕上只有 ~20px 且一直在动。给每个环绕体挂一个不可见的
  `SphereGeometry(0.72)` 命中球专门给 raycaster 用，视觉尺寸不变。
- **点击偶尔失效（太阳系）**：`handleClick()` 读的是上一帧的 `hovered`，从按下到抬起这 70ms 里
  行星已经移开，`hovered` 变 `null`，点击退化成「取消选中」。改为在 `pointerdown` 时就
  `pickAt()` 记录光标下的天体，抬起时以「按下命中 **或** 抬起命中」为准。
- **太阳系远处的行星全黑**：`PointLight` 默认按 1/r² 衰减，土星在 30 个显示单位外只剩
  约 1/900 的光。改用 `sunLight.decay = 0` 让照度不随距离衰减。
- **点开行星只看到一道亮边（夜面）**：`selectBody()` 只改 `targetRadius` 推近，从不调整方位角，
  所以镜头停在用户当时所在的那一侧 —— 大约一半概率正对夜面，木星/水星/土星都会变成
  「黑盘 + 亮边」。现在 `selectBody()` 会按天体→太阳的向量重算 `targetYaw`/`targetPitch`，
  偏开日线约 28°，保证画面里同时有受光面和晨昏线。
- **太阳变成一个白圆盘**：三层日冕 + 两条横向光带叠加后中心过曝，日面纹理完全看不见。
  把内层光晕透明度从 0.85/0.34/0.9 降到 0.46/0.22/0.34，光带从 0.5/0.16 降到 0.20/0.07。
- **土星被画面裁掉**：镜头推进用的是固定倍数 `dispR * 7.5`，土星直径大就出框。改成按
  「该天体应占据视口高度的百分比」反算距离：`r / (wantFraction * tan(fov/2))`。
- **小行星带像一团噪点**：粒子均匀铺满环带 + 加法混合过亮。改成向环带中段聚集
  （`(rnd()+rnd()+rnd())/3`）、收窄 y 方向散布、透明度 0.42 → 0.26。
- **Remotion 渲染时 `Permission denied`**：把 `TMP`/`TEMP` 指到工程内再渲染。
- **CDN 依赖**：原本 importmap 指向 unpkg，无网络时模块加载失败导致整个脚本不执行。
  已改为本地 `web/vendor/`。
- **双击 HTML 打不开（页面一直停在 loading）**：`file://` 下 Chrome 拒绝加载
  `./vendor/three.module.js`，控制台报 `Access to script ... from origin 'null' has been
  blocked by CORS policy`，于是 `__SOLAR__` 是 `undefined`、画布永远不出内容。
  `scripts/build-standalone.cjs` 用 esbuild 把 three 和脚本打进同一个 `<script>`，
  产出 `web/solar-standalone.html`，双击即可打开。注意内联脚本里若出现字面量
  `</script>` 会提前闭合标签，构建脚本对此有断言。
