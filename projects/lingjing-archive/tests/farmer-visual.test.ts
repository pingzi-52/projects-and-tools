import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { FARMER_FRAMES, FarmerVisual, hasFarmerFrames, selectFarmerFrame } from "../src/game/systems/farmerVisual";

describe("independent farmer visual selection", () => {
  it("keeps all four facing directions when idle, regardless of elapsed walk time", () => {
    for (const facing of ["down", "left", "right", "up"] as const) {
      expect(selectFarmerFrame(facing, false, 537)).toBe(`${facing}_idle`);
    }
  });

  it("advances on 180ms boundaries and wraps after three steps", () => {
    expect(selectFarmerFrame("left", true, 0)).toBe("left_walk1");
    expect(selectFarmerFrame("left", true, 179)).toBe("left_walk1");
    expect(selectFarmerFrame("left", true, 180)).toBe("left_walk2");
    expect(selectFarmerFrame("left", true, 359)).toBe("left_walk2");
    expect(selectFarmerFrame("left", true, 360)).toBe("left_idle");
    expect(selectFarmerFrame("left", true, 539)).toBe("left_idle");
    expect(selectFarmerFrame("left", true, 540)).toBe("left_walk1");
    expect(selectFarmerFrame("up", true, 720)).toBe("up_walk2");
  });

  it("handles invalid timing without selecting a missing frame", () => {
    for (const elapsed of [-1, NaN, Infinity, -Infinity]) {
      expect(selectFarmerFrame("right", true, elapsed)).toBe("right_walk1");
    }
  });

  it("requires all 12 atlas frames and falls back when any direction is incomplete", () => {
    const complete = new Set(FARMER_FRAMES);
    expect(complete.size).toBe(12);
    expect(hasFarmerFrames(name => complete.has(name))).toBe(true);
    for (const frame of complete) {
      expect(hasFarmerFrames(name => name !== frame && complete.has(name))).toBe(false);
    }
    expect(hasFarmerFrames(() => false)).toBe(false);
  });
});

describe("farmer visual final-position synchronization", () => {
  class DisplayImage {
    frame = { name: "down_idle" };
    x = 0; y = 0; depth = 0;
    setOrigin() { return this; }
    setDisplaySize() { return this; }
    setFrame(frame: string) { this.frame.name = frame; return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setAngle() { return this; }
    setDepth(depth: number) { this.depth = depth; return this; }
    destroy = vi.fn();
  }

  function sceneWithDisplay() {
    const image = new DisplayImage();
    const scene = {
      textures: { exists: () => true, get: () => ({ has: () => true }) },
      add: { image: (x: number, y: number) => image.setPosition(x, y) },
      tweens: { killTweensOf: vi.fn() },
    };
    return { image, scene: scene as unknown as Phaser.Scene, tweens: scene.tweens };
  }

  it("aligns to final proxy feet and depth without advancing the walk clock twice", () => {
    const { scene, image } = sceneWithDisplay();
    const visual = new FarmerVisual(scene, 100, 116);
    visual.update("right", true, 180);
    expect(image.frame.name).toBe("right_walk1");
    visual.syncPosition(102.67, 118.67);
    expect(image.x).toBe(102.67); expect(image.y).toBe(118.67);
    expect(image.depth).toBe(10 + 118.67 / 10000);
    visual.syncPosition(103, 120);
    expect(image.frame.name).toBe("right_walk1");
    visual.update("right", true, 0);
    expect(image.frame.name).toBe("right_walk2");
  });

  it("removes the companion and its action tweens, making late sync harmless", () => {
    const { scene, image, tweens } = sceneWithDisplay();
    const visual = new FarmerVisual(scene, 100, 116);
    visual.destroy();
    expect(image.destroy).toHaveBeenCalledOnce();
    expect(tweens.killTweensOf).toHaveBeenCalledOnce();
    visual.syncPosition(200, 216);
    expect(image.x).toBe(100); expect(image.y).toBe(116);
  });
});
