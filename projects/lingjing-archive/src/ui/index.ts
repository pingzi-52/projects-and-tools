/**
 * UI 层占位（预留接口）。
 * 目前 HUD 由 FarmScene 内 Phaser 文本对象直接构建；
 * 后续若引入 React DOM HUD 或背包面板，在此处导出组件与状态桥接。
 */

/** HUD 显示用的快照（由场景从 GameSession 读取后传入，不持有状态本身） */
export interface HudSnapshot {
  day: number;
  seasonLabel: string;
  gold: number;
}
