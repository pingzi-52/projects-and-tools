export interface TreeImage {
  readonly x: number;
  readonly y: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly alpha: number;
  setAlpha(alpha: number): unknown;
}

interface TreeBounds {
  image: TreeImage;
  left: number;
  right: number;
  top: number;
  bottom: number;
  baseAlpha: number;
}

const FADE_DURATION = 180;
const OCCLUDED_ALPHA = 0.25;
const EPSILON = 1e-8;

/** Forest-only display effect; the supplied bottom-anchored images keep ownership of their geometry. */
export class TreeOcclusion {
  private readonly trees: TreeBounds[] = [];
  private wasPaused = false;
  private destroyed = false;

  constructor(images: readonly TreeImage[]) {
    for (const image of images) {
      const { x, y, displayWidth: width, displayHeight: height, alpha } = image;
      if (![x, y, width, height, alpha].every(Number.isFinite) || width <= 0 || height <= 0 || alpha < 0 || alpha > 1) continue;
      this.trees.push({
        image, left: x - width / 2, right: x + width / 2,
        top: y - height, bottom: y, baseAlpha: alpha,
      });
    }
  }

  update(player: { x: number; y: number }, delta: number, paused: boolean): void {
    if (this.destroyed) return;
    if (paused) { this.wasPaused = true; return; }
    const elapsed = this.wasPaused || !Number.isFinite(delta) ? 0 : Math.max(0, Math.min(100, delta));
    this.wasPaused = false;
    if (elapsed === 0) return;
    const validPlayer = Number.isFinite(player.x) && Number.isFinite(player.y);
    const left = player.x - 16, right = player.x + 16;
    const bottom = player.y + 16, top = bottom - 44;
    for (const tree of this.trees) {
      const occludes = validPlayer && tree.bottom > bottom
        && tree.left < right && tree.right > left && tree.top < bottom && tree.bottom > top;
      const target = tree.baseAlpha * (occludes ? OCCLUDED_ALPHA : 1);
      const difference = target - tree.image.alpha;
      if (Math.abs(difference) <= EPSILON) continue;
      const step = tree.baseAlpha * (1 - OCCLUDED_ALPHA) * elapsed / FADE_DURATION;
      const next = Math.abs(difference) <= step + EPSILON
        ? target : tree.image.alpha + Math.sign(difference) * step;
      tree.image.setAlpha(next);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const tree of this.trees) if (tree.image.alpha !== tree.baseAlpha) tree.image.setAlpha(tree.baseAlpha);
  }
}
