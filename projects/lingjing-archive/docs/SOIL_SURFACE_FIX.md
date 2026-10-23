# 两块预设农田 · 土壤显示修复

用户指出截图中两块田地有问题。本轮只修这些地块及同类耕地的显示，原地图位置、碰撞、种植规则、V3存档和原素材不动。

定位：v3土壤图细碎斑点/细垄纹缩到每个32×32格再重复铺满4×4，形成高频“地毯纹”；未开垦预留田也被显示成已耕地，土/草交界是硬矩形。

修复：
- 用image_gen制作原创v4平静土色、宽浅垄沟、稀疏草缘PNG，raw/dry/wet三块；原图与提示词、尺寸、SHA保留。2172×724 RGBA角alpha0，未认证原生32px。
- 原两块4×4位置完整保留：rows7–10，左cols7–10、右cols13–16；有农舍时原bed格只做土壤视觉衔接，不改逻辑。
- 未实际开垦的田是raw；现有farming状态决定dry/wet。每格四个16×16图集片段按四邻连接，只在外露边使用草缘，内部不重复草边。新开垦草地可和预留田连续接上，孤立格同样有封闭外缘。
- 独立FarmSoilSurface模块及Boot载入钩子；FarmScene少量初始化/刷新/season/shutdown挂钩。草底覆盖旧不透明土，以便alpha边露出周围草色；图元均无body。新图缺所需帧时回到v3/旧耕地显示，保留可玩性。

验收：
- npm run build通过；22文件303测试通过。新增6布局/状态/连接/边界/只读测试、1实际PNG108帧与48邻接选择的资源合同测试，既有296项保留。
- 独立Chrome/browser-harness，正式/index.html，v4PNG和JSON均200，108帧。空田32cells/32草底/128片段，未创建农田状态；无土壤body。截图与用户红框位置对齐，玩家body.reset(400,304)仅调整测试站位。
- 真市场买5萝卜种子500→450；真实数字键/鼠标在右田7_13/14/15与8_13/14/15开垦，后排播种三株，13列浇水。raw→dry→wet正确，种子帧正常，逻辑body仍32×28。
- 真开垦孤立12_10及紧邻原田6_13：总34cells/136片段，所有图元bounds严格在各自32格内，连接边不绘制内部草缘；装饰隐藏由原环境机制处理。
- 刷新→标题Enter读取V3，存档对象与刷新前相等，450/day1/8耕地/3株/湿土全部恢复；原数据没有因换美术而重置。测试等待场景及素材加载完成，未将预加载延迟误判为规则失败。
- 真进入农舍并E床睡觉到day2：浇水的8_13 growthDay1/sprout，未浇水8_14/15仍0，全部湿土回dry。
- 3次再进出，cells34/片段136、E监听1、POST_UPDATE2保持不变。测试临时删未使用wet角帧，再回标题进入：readyfalse，新层0图元、legacy8覆盖、3作物、day2/V3均保留。原项目PNG/JSON未修改。

截图：soil-fields-empty.png（空田/同用户视角）、soil-fields-worked.png（干湿+播种+扩展）、soil-fields-day2.png（过夜生长）。操作证据docs/verification/soil-surface-checks.json。预览http://127.0.0.1:5175/index.html。

范围：新增farmSoilSurface与v4素材；FarmScene/farmArtAssets仅表现挂钩。旧v3素材未删，placeholderAssets、地图、domain、session和persistence均不改。本地master已有工作保留，覆盖先备份/hash；未提交/推送/发布。下一步回到M2-C工具/HUD与音效。
