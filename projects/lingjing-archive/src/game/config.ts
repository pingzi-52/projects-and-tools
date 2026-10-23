/** 全局游戏常量 */

export const TILE = 32;

export const SCENE_BOOT = "boot";
export const SCENE_TITLE = "title";
export const SCENE_FARM = "farm";

/** 每格像素尺寸下的视野：16 × 12 格，zoom=2 放大渲染 */
export const VIEW = {
  width: 16 * TILE,
  height: 12 * TILE,
  zoom: 2,
} as const;
