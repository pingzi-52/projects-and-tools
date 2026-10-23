/** 四方向朝向（T4 子阶段2 新增） */
export type Facing = "up" | "down" | "left" | "right";

/**
 * 目标格计算：以角色中心像素坐标 + 朝向 + 瓦片尺寸，
 * 返回当前格沿朝向偏移一格后的 (row, col)。
 *
 * - 越界坐标不裁剪（由调用方自行判定）
 * - 非法入参抛 RangeError
 */
export function computeTargetTile(
  playerX: number,
  playerY: number,
  facing: Facing,
  tileSize: number,
): { row: number; col: number } {
  assertFinite(playerX, "playerX");
  assertFinite(playerY, "playerY");
  assertFinite(tileSize, "tileSize");
  if (tileSize <= 0) {
    throw new RangeError(`tileSize must be > 0, got ${tileSize}`);
  }

  const row = Math.floor(playerY / tileSize);
  const col = Math.floor(playerX / tileSize);

  switch (facing) {
    case "up":
      return { row: row - 1, col };
    case "down":
      return { row: row + 1, col };
    case "left":
      return { row, col: col - 1 };
    case "right":
      return { row, col: col + 1 };
  }
}

/**
 * 领域层地块 ID：`${row}_${col}`（与 T1 FarmTileState.id 契约一致）。
 * 非法（非整数）抛 RangeError；越界值不裁剪。
 */
export function tileIdOf(row: number, col: number): string {
  if (!Number.isInteger(row)) {
    throw new RangeError(`row must be an integer, got ${row}`);
  }
  if (!Number.isInteger(col)) {
    throw new RangeError(`col must be an integer, got ${col}`);
  }
  return `${row}_${col}`;
}

/**
 * 由本帧**实际生效**的速度向量与上一次朝向，推导新朝向。
 *
 * - (vx, vy) 均为 0：保持 prev（静止不转向）
 * - 两轴绝对值相等且都非零：横向优先
 * - 否则取绝对值较大的轴
 *
 * 纯函数，无副作用，可在 Node/Vitest 中单测。
 */
export function pickFacing(vx: number, vy: number, prev: Facing): Facing {
  if (vx === 0 && vy === 0) return prev;

  const ax = Math.abs(vx);
  const ay = Math.abs(vy);

  if (ax >= ay) {
    return vx > 0 ? "right" : "left";
  }
  return vy > 0 ? "down" : "up";
}

// ── 内部工具 ────────────────────────────────────
function assertFinite(v: number, name: string): void {
  if (!Number.isFinite(v)) {
    throw new RangeError(`${name} must be finite, got ${v}`);
  }
}
