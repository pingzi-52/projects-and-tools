# 2026-10-20 GitHub开发备份交接

目标私有仓库：[pingzi-52/lingjing-farm](https://github.com/pingzi-52/lingjing-farm)。最新开发分支是 **feature/beta-guidance**，main保留10月16日旧快照。代码快照 `e7dd46f4216f5807432f7bb690f2b20e59515097` 已上传并核对远端SHA一致，根tree `5260b5329c5a62d371df4787628d61fab6229a94`，共726个项目文件。完成记录随后单独提交，最终文档提交见git log。

完整包含当前美术/地图可读性/居民动作、钓鱼、一次性首钓委托、V7兼容存档、来源许可、测试和原始截图。上传前961项测试和严格类型/生产构建通过，既有大包提示保留。不是公开Release，也没有部署线上游戏。

## 换电脑

```bash
git clone --branch feature/beta-guidance https://github.com/pingzi-52/lingjing-farm.git
cd lingjing-farm
npm ci
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

打开 http://127.0.0.1:5175/index.html 。需有私有仓库访问权限，建议Node24。本仓库包含素材，无需重新下载，不依赖原机器盘符或.env/API密钥。

已克隆旧版本时，在自己的工作保存后：git fetch origin，再切换到feature/beta-guidance；已有同名本地分支可pull --ff-only。不要在未确认的个人改动上执行reset或强制切换。不使用Git时先在仓库页面切换到feature/beta-guidance，再Code→Download ZIP。

浏览器游玩档不随代码同步；V7新增首钓委托状态，V1–V6严格迁移。旧版程序不能读V7。保留原始备份规则，不上传个人浏览器目录。

## 继续开发

先读[池塘打磨](POND_POLISH.md)与[10月20日技术交接](handoff-2026-10-20.md)。已完成池边点缀、明确钓鱼反馈、任意鱼交付60金和四任务手记。下一优先人物/建筑像素尺度与调色统一，不一口气重做全图。

实机验证范围保留原记录：正式目录两次银鳞鲫、指定交付一尾、560金/92体力/余一鱼；预览刷新完成状态通过，最后正式页刷新因浏览器工具超时未新增确认。未做全年/全渲染器或浏览器强制写失败；这些不妨碍源码备份，不把它写成商业完成。
