# 目标框与禾木比例修复 · 2026-10-15

用户截图反馈：黄框与田地对不齐、NPC看起来扁。已在同一站位复现并修复，未重画地图或替换原素材。

## 原因与改动

1. 土地逻辑和旧框同为32px格，并无存档坐标错位。但旧图集每个3×3来源补丁裁654px，实际泥土边缘向内留约9–11px草色边（以游戏显示计），导致框左侧看起来悬在草上。新增soil-patches-v3.json，仍使用原v4 PNG，裁切框为raw(98,99,546,546)、dry(819,99,546,546)、wet(1542,99,546,546)，四分片91px；保留轻微自然边缘，将可见土面对齐逻辑地块。旧v2 JSON与PNG保留。
2. 黄色框边线原来跨出格界1px，且在Scene.update时读取物理代理上帧坐标。现在30×30形状偏移1px，2px描边完整位于32格内，并在Arcade完成POST_UPDATE同步后定位；只显示可耕地，菜单内隐藏，shutdown解绑。
3. 禾木裁切576×1096原图被强制32×40，横向相对纵向被拉宽约52%。改为统一scale=44/1096，实际23.124×44，原图比例保持；底部锚点不变，名字/交互文字随高度放置。碰撞仍32×28，商店/任务范围不变。

只改FarmScene显示钩子、merchantResident等比显示、farmArtAssets图集JSON路径、图集合同测试，新增NPC比例回归与新JSON。原PNG像素、原地图、领域/种植规则、V5存档、物理代理与placeholder本轮均未改变。

## 验证

- 最终TypeScript与Vite62模块构建通过，34文件543测试通过，git diff --check通过（既有CRLF提示保留）。NPC新回归保证横纵scale相同、保留576/1096比例、feet和32×28碰撞不变；图集108帧仍验证全部48种状态/邻接选择与PNG界内。
- 独立Chrome中从四方向分别面对8_13，目标均8_13，框边界x417/y257/w30/h30，描边外缘恰对应416/256..448/288。
- 实际鼠标开垦、浇水仅修改8_13；新wet四分片均91px，显示与命中一致。
- D/S真实持续移动：93帧POST_UPDATE采样，框相对当帧目标偏移全部0。
- NPC实际scaleX=scaleY=0.0401459854，显示23.124×44，body32×28。
- 三次进出屋：postupdate3（原World/人物同步2，加目标框1）、E监听1、NPC body1；田地不变。Q手记打开框隐藏。刷新恢复相同田地、V5保持。
- 前后对照使用相同站位/相机与07:10光照；07:10为独立测试档时钟夹具，不伪称真实等待。用户浏览器存档未触碰。

实测数据：[verification/alignment-fix-checks.json](verification/alignment-fix-checks.json)。截图：[修前田边](screenshots/alignment-before.png)、[修后田边](screenshots/alignment-after.png)、[浇水命中](screenshots/alignment-wet.png)、[禾木等比](screenshots/alignment-npc.png)。均真实游戏画布。

master既有未提交工作上修复，完整备份与SHA校验在farm-alignment-fix。未提交、推送或发布。预览5175保留，隔离测试Chrome关闭。其他季节素材/商人陈设等后续工作仍按路线推进，本轮先处理用户反馈。
