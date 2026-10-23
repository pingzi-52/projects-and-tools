import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { addWoodPanel, planWoodPanel } from '../src/ui/woodPanel';

describe('wood panel slice plan', () => {
  it.each([[154, 34], [204, 58], [496, 44], [496, 48], [12, 12], [12, 13], [13, 12], [13, 13]])(
    'covers every pixel exactly once at %i × %i using bounded, positive source rectangles',
    (width, height) => {
      const slices = planWoodPanel(width, height);
      const coverage = new Uint8Array(width * height);
      for (const { source, target } of slices) {
        expect(source.x).toBeGreaterThanOrEqual(0);
        expect(source.y).toBeGreaterThanOrEqual(0);
        expect(source.width).toBeGreaterThan(0);
        expect(source.height).toBeGreaterThan(0);
        expect(source.x + source.width).toBeLessThanOrEqual(154);
        expect(source.y + source.height).toBeLessThanOrEqual(34);
        expect(target.width).toBeGreaterThan(0);
        expect(target.height).toBeGreaterThan(0);
        expect(target.x).toBeGreaterThanOrEqual(0);
        expect(target.y).toBeGreaterThanOrEqual(0);
        expect(target.x + target.width).toBeLessThanOrEqual(width);
        expect(target.y + target.height).toBeLessThanOrEqual(height);
        for (let y = target.y; y < target.y + target.height; y++) {
          for (let x = target.x; x < target.x + target.width; x++) coverage[y * width + x]++;
        }
      }
      expect(new Set(coverage)).toEqual(new Set([1]));
    },
  );

  it.each([[204, 58], [496, 44], [496, 48], [13, 13]])(
    'keeps all four 6px corner pieces unscaled at %i × %i',
    (width, height) => {
      const corners = planWoodPanel(width, height).filter(({ source }) => source.width === 6 && source.height === 6);
      expect(corners).toEqual(expect.arrayContaining([
        { source: { x: 0, y: 0, width: 6, height: 6 }, target: { x: 0, y: 0, width: 6, height: 6 } },
        { source: { x: 148, y: 0, width: 6, height: 6 }, target: { x: width - 6, y: 0, width: 6, height: 6 } },
        { source: { x: 0, y: 28, width: 6, height: 6 }, target: { x: 0, y: height - 6, width: 6, height: 6 } },
        { source: { x: 148, y: 28, width: 6, height: 6 }, target: { x: width - 6, y: height - 6, width: 6, height: 6 } },
      ]));
      expect(corners).toHaveLength(4);
    },
  );

  it('keeps the original image completely undistorted at its native size', () => {
    const slices = planWoodPanel(154, 34);
    expect(slices).toHaveLength(9);
    for (const { source, target } of slices) expect(target).toEqual(source);
  });

  it('preserves single-pixel outline thickness on every edge when stretched', () => {
    const slices = planWoodPanel(496, 48);
    const horizontalEdges = slices.filter(({ source }) => source.y === 0 || source.y + source.height === 34);
    const verticalEdges = slices.filter(({ source }) => source.x === 0 || source.x + source.width === 154);
    expect(horizontalEdges).toHaveLength(6);
    expect(verticalEdges).toHaveLength(6);
    for (const { source, target } of horizontalEdges) expect(target.height / source.height).toBe(1);
    for (const { source, target } of verticalEdges) expect(target.width / source.width).toBe(1);
  });

  it.each([[12, 12, 4], [12, 34, 6], [154, 12, 6]])(
    'omits zero-area middle slices at %i × %i',
    (width, height, count) => expect(planWoodPanel(width, height)).toHaveLength(count),
  );

  it.each([NaN, Infinity, -Infinity, -1, 0, 11, 11.99, 12.5])('rejects invalid dimension %s on either axis', (size) => {
    expect(() => planWoodPanel(size, 34)).toThrow(RangeError);
    expect(() => planWoodPanel(154, size)).toThrow(RangeError);
  });
});

describe('wood panel images', () => {
  function textureRecorder() {
    const frames = new Map<string, number[]>();
    const texture = {
      firstFrame: '__BASE',
      has: vi.fn((name: string) => frames.has(name)),
      add: vi.fn((name: string, sourceIndex: number, x: number, y: number, width: number, height: number) => {
        if (frames.has(name)) return null;
        frames.set(name, [sourceIndex, x, y, width, height]);
        if (texture.firstFrame === '__BASE') texture.firstFrame = name;
        return { name };
      }),
    };
    return texture;
  }

  function imageRecorder(texture = textureRecorder()) {
    const images: Array<{
      x: number; y: number; texture: string; frame: string;
      setOrigin: ReturnType<typeof vi.fn>; setCrop: ReturnType<typeof vi.fn>;
      setScale: ReturnType<typeof vi.fn>; setScrollFactor: ReturnType<typeof vi.fn>;
      setDepth: ReturnType<typeof vi.fn>; setDisplaySize: ReturnType<typeof vi.fn>;
    }> = [];
    const scene = {
      textures: { get: vi.fn(() => texture) },
      add: {
        image: vi.fn((x: number, y: number, texture: string, frame = '__BASE') => {
          const image = {
            x, y, texture, frame,
            setOrigin: vi.fn().mockReturnThis(), setCrop: vi.fn().mockReturnThis(),
            setScale: vi.fn().mockReturnThis(), setScrollFactor: vi.fn().mockReturnThis(),
            setDepth: vi.fn().mockReturnThis(), setDisplaySize: vi.fn().mockReturnThis(),
          };
          images.push(image);
          return image;
        }),
      },
    };
    return { scene: scene as unknown as Phaser.Scene, images, texture, getTexture: scene.textures.get };
  }

  it.each([[154, 34], [204, 58], [496, 44], [496, 48]])(
    'draws frame images at integer planned positions within %i × %i, with fixed HUD depth',
    (width, height) => {
    const { scene, images, getTexture } = imageRecorder();
    addWoodPanel(scene, 17, 23, width, height, 905);
    const slices = planWoodPanel(width, height);
    expect(getTexture).toHaveBeenCalledExactlyOnceWith('panel_wide');
    expect(images).toHaveLength(9);
    images.forEach((image, index) => {
      const { source, target } = slices[index]!;
      expect(image.texture).toBe('panel_wide');
      expect(image.frame).toBe(`wood-panel-${source.x}-${source.y}`);
      expect(image.setOrigin).toHaveBeenCalledExactlyOnceWith(0);
      expect(image.setCrop).not.toHaveBeenCalled();
      expect(image.setScale).not.toHaveBeenCalled();
      expect(image.x).toBe(17 + target.x);
      expect(image.y).toBe(23 + target.y);
      expect(Number.isInteger(image.x)).toBe(true);
      expect(Number.isInteger(image.y)).toBe(true);
      expect(image.setDisplaySize).toHaveBeenCalledExactlyOnceWith(target.width, target.height);
      expect(image.x + target.width).toBeLessThanOrEqual(17 + width);
      expect(image.y + target.height).toBeLessThanOrEqual(23 + height);
      expect(image.setScrollFactor).toHaveBeenCalledExactlyOnceWith(0);
      expect(image.setDepth).toHaveBeenCalledExactlyOnceWith(905);
    });
  });

  it('registers the exact nine bounded source frames without changing the default texture frame', () => {
    const { scene, texture } = imageRecorder();
    addWoodPanel(scene, 0, 0, 204, 58, 1);
    expect(texture.add.mock.calls).toEqual([
      ['wood-panel-0-0', 0, 0, 0, 6, 6],
      ['wood-panel-6-0', 0, 6, 0, 142, 6],
      ['wood-panel-148-0', 0, 148, 0, 6, 6],
      ['wood-panel-0-6', 0, 0, 6, 6, 22],
      ['wood-panel-6-6', 0, 6, 6, 142, 22],
      ['wood-panel-148-6', 0, 148, 6, 6, 22],
      ['wood-panel-0-28', 0, 0, 28, 6, 6],
      ['wood-panel-6-28', 0, 6, 28, 142, 6],
      ['wood-panel-148-28', 0, 148, 28, 6, 6],
    ]);
    expect(texture.firstFrame).toBe('__BASE');
  });

  it('reuses the registered frames across panels and scenes sharing the same texture', () => {
    const first = imageRecorder();
    const second = imageRecorder(first.texture);
    addWoodPanel(first.scene, 0, 0, 204, 58, 1);
    addWoodPanel(first.scene, 40, 50, 496, 44, 2);
    addWoodPanel(second.scene, 10, 20, 496, 48, 3);
    expect(first.texture.add).toHaveBeenCalledTimes(9);
    expect(first.texture.has).toHaveBeenCalledTimes(27);
    expect(first.images).toHaveLength(18);
    expect(second.images).toHaveLength(9);
  });

  it('creates only four visible corner images at minimum size, even at depth zero', () => {
    const { scene, images } = imageRecorder();
    addWoodPanel(scene, 0, 0, 12, 12, 0);
    expect(images).toHaveLength(4);
    for (const image of images) {
      expect(image.setDisplaySize).toHaveBeenCalledExactlyOnceWith(6, 6);
      expect(image.setDepth).toHaveBeenCalledExactlyOnceWith(0);
    }
  });

  it('validates the full panel before creating any image', () => {
    const { scene, images } = imageRecorder();
    expect(() => addWoodPanel(scene, 0, 0, 11, 34, 1)).toThrow(RangeError);
    expect(images).toHaveLength(0);
  });
});
