# M2-C · 工具图标、操作声与声音设置（2026-10-15）

已完成本地实现、正式构建、回归和实机验收：25个原创物品图标统一到快捷栏、选中物品、金币、背包、集市和木箱；增加10类合成短音、轻量风雨环境声、独立保存的声音设置。原V5游戏存档与种植规则本轮不变。

## 实际操作

标题、农场和屋内按M打开声音设置；可静音、调整操作/风雨音量、试听或恢复默认，M/Esc关闭，Tab循环，滑块方向键原生可用。打开设置、背包、集市、对话等菜单暂停经营与环境声，允许明确的按钮/交易试听短音。后台停止声音和时间，回前台不补播。

首次真实按键/点击后才创建并解锁Web Audio上下文；未解锁时游戏照常可玩。默认操作0.5、风雨0.16。偏好只保存到`four-seasons-farm/audio`，不增加V5字段；浏览器拒绝存设置时本次音量/静音仍生效，显示“当前会话生效，刷新后可能丢失”。

快捷栏改为32px木格、24px物品图，有1–8标号和堆叠数量；整条居中，空槽无旧灰色占位。选中图16px、菜单图32px。缺新帧仍回落旧纹理，未覆盖placeholderAssets.ts。

## 素材与声音

`public/farm-assets/original-addons/v6/item-icons-v1.png`为未改像素的原创完整源图，1268×1241 RGBA、角alpha0。25帧为两工具、金币、十一作物各自的种子袋/收获物；每帧按实际alpha边界裁切并以方形sourceSize居中，不假设生成图严格均匀网格。JSON、测量bounds、提示词和SOURCE齐全。高分辨率像素风，未认证原生16/32px网格或有限色板。

FarmAudio用Web Audio滤波噪声/振荡器即时合成hoe/water/plant/harvest/coin/confirm/error/door/sleep/step，不下载录音，不引入音乐或第三方音源授权。仅一个AudioContext，Phaser空声卡禁用避免额外context。短声定时stop/onended断开；最多12并发，通用60ms、脚步240ms限频；环境最多两条source。标题无环境；雨天农场风+雨两条、室内仅减弱雨声一条。

新增系统与设置界面独立模块；场景只接成功操作、暂停和切场钩子；重复已耕/已湿不播成功声，脚步依据真实位移。主进程结束时移除监听/音源并关闭context。无新依赖，无游戏存档迁移。

## 验证证据

33文件542项Vitest通过（新增54图标合同、33音频/偏好边界）；最终TypeScript+Vite62模块构建通过。交叉只读审查核对音频与设置生命周期，发现的半格快捷栏偏移已修正。主Agent核对真实PNG尺寸/透明/25裁切及实际菜单。

独立Chrome真实页面与CDP键鼠操作，详细数据[verification/m2c-feedback-checks.json](verification/m2c-feedback-checks.json)：

- 无手势context不存在；首次M后单context running；标题无环境source。Phaser noAudio=true。
- 真实试听短音的WebAudio输出采样峰值0.04068、RMS0.00418（该次采样）；静音后峰值和RMS均0，voices0。诊断用音频处理支路输出为静音，不重复声音。此证据证明实际输出与静音，不等于人耳听感验收，音色/响度仍待用户实际设备试听微调。
- Tab到原生滑块，左键盘方向将50%改49%；静音和49%刷新恢复。恢复默认成功，M/Esc正常关闭。
- 打开设置后W/E/B/I/Q/T/数字键不穿透，等待7.5秒位置、日期/时钟/体力、包/箱/田/任务和游戏主档原文均不变。设置面板420×294.5完整在512×384内。
- 对偏好存储主动抛错：静音仍即时生效、主gain0，显示未保存提示，V5原文不变；恢复后重试可保存。
- 使用前阶段真实经营记录的V5夹具进入，原数据全部相同。快捷栏新帧正确，余下空槽隐藏，收获物数量2显示；真实买5种子620→570金，菜单使用新高分辨率帧，coin声成功。
- 真开垦/播种/浇水有对应声音；重复耕/浇不新增成功声，播种5→4并即时显示4。真实4夜到day9、必要日浇水，收获让原有萝卜2→3，数量即时更新且harvest发声；门和睡觉发声。
- 声源随短音结束释放；后台document.hidden受控夹具立即master0/voices0/环境0，状态不推进，恢复只恢复环境。回标题环境0。
- 雨天补验为明确day6夹具（不伪称额外自然成长）：农场2环境source、屋内1，三次进出仍同一个context，voice0，农场环境2；M监听1、postupdate2、overlay0、浏览器errors空。

浏览器诊断说明：旧5175预览退出后恢复为同端口本机Vite。Windows无界面Chrome把测试页标hidden且Phaser帧数0；激活标签后仍未解除，使用CDP焦点模拟获得前台状态后正常测试，没有修改生产后台暂停。一次帧采样错过短音，改为音频处理时钟采样；测试Tab/按钮索引按真实DOM纠正后整轮重跑，最终均通过。测试档与用户浏览器存档隔离。

截图：[快捷栏](screenshots/m2c-toolbar.png)、[劳作](screenshots/m2c-working-icons.png)、[集市](screenshots/m2c-market-icons.png)、[声音设置](screenshots/m2c-audio-farm.png)、[标题设置](screenshots/m2c-audio-title.png)、[屋内设置](screenshots/m2c-audio-home.png)。均实际游戏画布/DOM，不是概念渲染。

## 状态

master现有未提交工作上完成；原文件完整备份/SHA守卫。未commit/push/PR/release。用户预览5175保留，独立测试Chrome验收后关闭。图标和操作反馈已完成；其他季节田间作物、商人陈设、NPC作息/好感、森林/采集仍待后续，未宣称完整商业游戏。
