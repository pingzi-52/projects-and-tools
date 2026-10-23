# 原创补件与16×12样板验收

预览：http://127.0.0.1:5175/showcase.html?style=cainos-farm

用户明确选择“按当前画风制作原创补充素材”。本轮使用内置 imagegen 生成水塘、土路和木围栏；Cainos树、草地、花草、石头使用原PNG。新增补件位置：public/farm-assets/original-addons/v1/。所有生成原图保留，未修改像素；JSON仅定义裁切帧。

三张PNG均1254×1254、有透明通道。生成结果未遵守要求的1024像素画布及8倍逻辑像素网格，因此不是认证原生32px素材。显示时使用pixelArt/nearest采样，实际密度仍需人工统一。围栏部分角落与内凹土路帧不符合要求，样板未使用；不能宣称完整autotile通过。

第一次截图发现路面格线：生成图的实际布局与等分网格不一致。按实际边界修改JSON裁切后黑色格线消除；局部色差和转角仍需后续修整。水塘为静态整块sprite，未制作水面动画。当前包含草地、土路、水塘、树、岩石、花草和围栏，独立512×384画布，不可操作，不接存档。

验收：tsc --noEmit与Vite构建通过。浏览器13个PNG/JSON请求均200，localStorage为空。截图docs/screenshots/cainos-farm-sample.png来自真实Chrome画布。没有重跑既有183项领域测试。正式FarmScene、placeholderAssets、domain、存档、种植与原地图未修改。未提交、推送或发布。

视觉结论：七类完整构图可继续比较；未达到参考图的暖色、丰富层次与商业级完成度。下一轮保持同一16×12样板，先做更丰富的植被簇与统一像素密度，再评估是否替换正式地图。

授权：Cainos遵守其官方Basic许可，来源与许可记录在cainos-basic/SOURCE.md；原创补件是用户授权AI生成，并非Cainos作者发布资产，也不能把原包授权直接套用于原创补件。未使用Mana Seed。
