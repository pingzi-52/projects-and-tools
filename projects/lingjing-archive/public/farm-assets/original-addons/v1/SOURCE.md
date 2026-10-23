# 原创补件 V1 — 生成记录

工具：内置 imagegen。用户授权：按当前画风制作原创补充素材。
生成日期：2026-10-14。三个独立文本生成任务，透明背景，不引用第三方图片。

提示要求摘要（非完整工具日志）：
- 公共：warm detailed rural top-down pixel art；olive-green woodland；grass #72751b、foliage #596629/#889245、earth #968153/#baa575、stone #898579、outline #51432c；upper-left lighting；transparent；no labels/UI/background scene；要求1024×1024、128逻辑像素以8倍nearest显示、无抗锯齿。
- pond：一个不规则池塘，112×96逻辑像素，desaturated blue/teal #536f77/#6e9495/#93b6af，窄石土岸、少量草、3处芦苇，透明外部，离散色带和少量水面高光，8逻辑像素边距。
- dirt：4×4、32逻辑像素格、无间隔；前三行外角/边/中心，最后一行四个内凹角；tan/brown、细石、2至3像素自然边界，外部透明，要求边缘连续。
- fence：4×4、32逻辑像素格、无间隔；老橡木 #84643c/#aa8650/#c3a06a；两横梁；第一行横向/纵向/柱/破损；第二行四角；第三行两扇64×32开关门；第四行四端；透明、无场景或文字，要求横梁对齐。

实际结果：三图均1254×1254 RGBA，没有严格实现指定逻辑网格。作为视觉样板候选保留，不认证为最终可平铺素材。

文件：pond-v1.png、dirt-road-v1.png、wood-fence-v1.png为生成原图。两份JSON按实际内容裁切，不改变PNG。当前土路仅使用外边/外角/中心；围栏仅使用横向/纵向/柱/关门。禁止把未使用角落描述为已验收。
