# 原水塘岸线显示接入

2026-10-14，本轮独立模块 `src/game/systems/farmWater.ts`，地图只读 planner `farmWaterPlan.ts`。

- 原地图水塘共 12 格，包围范围 5×4 格。原阻挡、坐标和任何存档字段均不修改。
- 使用已接受原创 `public/farm-assets/original-addons/v1/pond-v1.png` 的中央水纹理区域（x350/y405/550×350）。将同一源区域按地图连续坐标分帧，避免每格重复图造成明显接缝。
- 岸线仅在没有相邻水格的边缘出现，10px 宽并放在阻挡格内部。岸线和闪光来自同一未经修改的源图帧，不画程序噪点、不整张缩放覆盖水塘。
- 边缘少量 8×8 石头使用已接入 Cainos `TX Props - Stone 03` 原图。保留原包来源和许可记录，未改 PNG。
- 水光每 900ms 低幅透明度交替变化。新模块有自身计时器，`destroy()` 会停止计时器并释放显示对象。主场景应不再将被替换的水格加入旧 waterImages；失败时 `render()` 返回 false，保留旧显示。
- 季节为临时 tint，冬季不宣称冻结图或独立四季素材。

API：`FarmWater.preload(scene)`，`new FarmWater(scene, world)`，`render(tile,row,col):boolean`，`applySeason(season)`，`destroy()`。

已验证：`npm test -- tests/farm-water.test.ts`，3 测试通过；验证原12格、实际外缘、邻水无岸、地图边界与空水塘。TypeScript 在首次运行时仅因并行开发的 save-v2 测试调用尚未实现的 Session/Save API 报错，水模块无诊断；由主 Agent 完成最终集成构建和截图。

已知限制：边缘仍跟随原格状阻挡，保持行走边界可信优先；源图为生成视觉原型，非原生32px自动拼接图集。水纹理和岸线像素密度暂适配当前展示，最终能否接受以主 Agent 实机截图为准。模块新增文件未提交、未推送或发布。
主Agent实机验收更新：初版bank裁切呈细框，不通过；最终改为72个8至10px Cainos Stone01/03/05/06，在每条暴露边内部排列。移除bank源帧，连续水底与水光保留。截图docs/screenshots/m1-pond.png；12水体均32×32，原地图未改。
