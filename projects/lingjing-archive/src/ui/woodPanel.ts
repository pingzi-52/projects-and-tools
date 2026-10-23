import type Phaser from 'phaser';

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WoodPanelSlice {
  source: Rectangle;
  target: Rectangle;
}

/** Resizes the 154 × 34 panel_wide texture while preserving its 6px frame. */
export function planWoodPanel(width: number, height: number): WoodPanelSlice[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 12 || height < 12) {
    throw new RangeError('Wood panel dimensions must be integers of at least 12 pixels.');
  }

  const sourceX = [0, 6, 148, 154];
  const sourceY = [0, 6, 28, 34];
  const targetX = [0, 6, width - 6, width];
  const targetY = [0, 6, height - 6, height];
  const slices: WoodPanelSlice[] = [];

  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const targetWidth = targetX[column + 1]! - targetX[column]!;
      const targetHeight = targetY[row + 1]! - targetY[row]!;
      if (targetWidth === 0 || targetHeight === 0) continue;
      slices.push({
        source: {
          x: sourceX[column]!, y: sourceY[row]!,
          width: sourceX[column + 1]! - sourceX[column]!,
          height: sourceY[row + 1]! - sourceY[row]!,
        },
        target: { x: targetX[column]!, y: targetY[row]!, width: targetWidth, height: targetHeight },
      });
    }
  }
  return slices;
}

/** Texture frames work with both renderers without fractional crop offsets. */
export function addWoodPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
): void {
  const slices = planWoodPanel(width, height);
  const texture = scene.textures.get('panel_wide');
  for (const { source, target } of slices) {
    const frameName = `wood-panel-${source.x}-${source.y}`;
    if (!texture.has(frameName)) {
      const defaultFrame = texture.firstFrame;
      texture.add(frameName, 0, source.x, source.y, source.width, source.height);
      // Adding the first named frame changes Phaser's default; keep panel_wide intact.
      texture.firstFrame = defaultFrame;
    }
    scene.add.image(x + target.x, y + target.y, 'panel_wide', frameName)
      .setOrigin(0)
      .setDisplaySize(target.width, target.height)
      .setScrollFactor(0)
      .setDepth(depth);
  }
}
