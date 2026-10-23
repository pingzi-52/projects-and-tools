# M2-B · 人物与春季作物统一

这一轮完成正式游戏的人物、春季作物和耕地表现。接续M2-A农舍/储物，不将此阶段等同于整套M2或商业完成度。夏秋冬作物、工具/HUD图标和音效仍待推进。

## 已实现

- 原创草帽农人：下/左/右/上四方向，每方向站立与两步走动，共12帧。显示32×40，固定脚底与按脚位排序，农场和室内共用。开垦、浇水、播种、收获成功时有短促姿态反馈，失败不播放成功动作。
- 原角色物理代理保留，原纹理实际注册32×28，逻辑格32×32。显示图独立无body；速度160、朝向、目标格及已有碰撞规则保留。动画在update推进一次，位置/depth在ArcadePhysics的POST_UPDATE之后同步，修复初次接入时约1步的显示滞后；shutdown精准解除监听并销毁图/tween。
- 青露萝卜、晨光豆、星芽莓，各自seed/sprout/young/mature，共12帧。原CropService决定阶段，JSON只改变图像。作物固定32×32、格底锚点，更新同一sprite的texture/frame并重设显示尺寸。其他8种作物继续使用现有阶段/专用成熟回落。
- 干湿土壤两帧，32×32。覆盖原H农田和新开垦草地，读取已有watered；过夜自动恢复干土。静态农田同样使用干土图，不改地图。耕地/作物各有脏检查，装饰隐藏逻辑保留。
- Boot加载三套图集；完整12方向帧才隐藏旧人物。缺作物帧、湿土帧可回落原真实纹理，当前placeholder并没有tile_watered，不能返回不存在的key。

## 素材

路径：public/farm-assets/original-addons/v3/。使用内置image_gen生成，三个原PNG未改像素，提示词/SOURCE/provenance和实际边界均保留，旧素材与placeholderAssets.ts未覆盖。

| 文件 | 实际尺寸 | 通道 | 帧数 |
| --- | --- | --- | --- |
| farmer-v1.png | 1086×1448 | RGBA，角alpha0 | 12 |
| spring-crops-v1.png | 1448×1086 | RGBA，角alpha0 | 12 |
| soil-v1.png | 1774×887 | RGB，不透明 | 2 |

源图为高分辨率像素风素材，未认证原生16/32px或严格有限色板。实际格距不均，按透明边界读取得到JSON裁切，不按均匀spritesheet猜坐标。角色trim统一sourceSize208×312/bottom310；作物368×352/bottom350，保持成长大小变化和脚底一致。Phaser pixelArt最近邻缩采样。仍需后续人工像素规格打磨。

## 验证证据

- 最终npm run build通过（类型+Vite，50modules），npm test为20文件296项全部通过。包含6人物帧/同步测试、25crop/soil选择测试、5PNG尺寸/裁切/脚位合同测试。Node资产测试使用JS并纳入正常Vitest include，避免引入Node类型到浏览器TS配置。
- 独立Chrome/browser-harness，未读用户日常浏览器存档。6个v3PNG/JSON均HTTP200。真W/A/S/D移动，四方向walk2和对应停步idle均正确，body32×28。修复后22个移动/停步POST_UPDATE采样显示偏差dx/dy都为0。
- 真市场按钮买三种种子，500→437；原H田7_12/13/14实际开垦、播种、浇水，三种seed帧及dry→wet正确。使用body.reset只设置测试站位，操作由实际CDP键/鼠标触发，未通过改growthDay加速成熟。
- 真浇水+E进屋/床休息/出屋，连续8夜到day9。萝卜day5、豆day7、莓day9成熟；三种全部四阶段均实际出现。每夜土壤回dry，作物32×32/originY1/y256不变。8次重进人物图均1，E监听均1，POST_UPDATE均2（physics+当前Player），没有累积。
- 真E收获：萝卜和豆sprite移除，豆产量2；莓harvestedCount1/growthDay0，保留植株并切回原规则要求的seed图。真背包按钮出售24+40+70，金币437→571，包仅两工具。
- 墙/水碰撞：D向农舍墙停x304，保留区工具目标null；S向原水格停y498，原32×28体不变。
- 测试配置临时删starberry_seed/wet/up_idle帧：作物回crop_seed、湿土回tile_tilled；新Home角色旧图可见、无伴随图、POST_UPDATE仅physics1。没有改原PNG或正式资源；刷新重新加载全部原帧。
- 刷新→标题Enter恢复day9/gold571/V3及3块田，莓harvestedCount1/wateredtrue、原创seed/wet图正确；人物重新启用、伴随图1/POST_UPDATE2，6资源200。
- 本轮对规则、存档、GameSession、原地图和placeholder做SHA核对，无本轮变更；已有M1/M2-A未提交改动保留。git diff --check通过。

## 截图

均来自真实512×384游戏画布，非设计效果图。day9截图取自收获前，报告刷新结果为出售后的独立测试状态。

- m2-spring-seeds.png：day1三种种子、湿土。
- m2-spring-day2.png / m2-spring-day3.png / m2-spring-day5.png：实际生长过程。
- m2-spring-day9.png：三种作物全部成熟、统一人物。
- m2-farmer-home.png：统一人物在室内。

预览：http://127.0.0.1:5175/index.html。玩家精确位置/场景尚不保存；刷新仍回农场出生点。地图疏密、橄榄草色、工具/HUD与其他季节仍未达到参考图全部目标。下一阶段先工具/HUD与声音反馈，再进入M3昼夜/天气/NPC；内容和视觉逐项实机验收。

Git：master本地未提交，未推送/发布。覆盖文件已在F:\\codex word\\farm-character-work备份并SHA校验，原始生成文件保留。测试Chrome关闭，用户预览服务保留。
