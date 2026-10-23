import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { ResidentMotion, ResidentMotionClock, type ResidentKind, type ResidentPose } from "../src/game/systems/residentMotion";

function advance(clock: ResidentMotionClock, ms: number, near = false): ResidentPose {
  let pose = clock.update(0, near, false);
  for (let remaining = ms; remaining > 0; remaining -= 20) {
    pose = clock.update(Math.min(20, remaining), near, false);
  }
  return pose;
}

describe("resident motion clock", () => {
  it("starts idle, greets once on approach and does not repeat while the player stays nearby", () => {
    const clock = new ResidentMotionClock("merchant");
    expect(clock.update(0, false, false)).toBe("idle");
    expect(clock.update(0, true, false)).toBe("greet");
    expect(advance(clock, 640, true)).toBe("greet");
    expect(advance(clock, 20, true)).toBe("idle");
    expect(advance(clock, 2000, true)).toBe("idle");
  });

  it("greets again only after the player leaves and returns", () => {
    const clock = new ResidentMotionClock("guide");
    clock.update(0, true, false); advance(clock, 700, true);
    expect(clock.update(0, true, false)).toBe("idle");
    clock.update(0, false, false);
    expect(clock.update(0, true, false)).toBe("greet");
  });

  it("blinks briefly and returns to idle after 160 active milliseconds", () => {
    const clock = new ResidentMotionClock("merchant");
    expect(advance(clock, 4180)).toBe("idle");
    expect(advance(clock, 20)).toBe("blink");
    expect(advance(clock, 140)).toBe("blink");
    expect(advance(clock, 20)).toBe("idle");
    expect(advance(clock, 4620)).toBe("idle");
    expect(advance(clock, 20)).toBe("blink");
  });

  it("uses fixed distinct initial blink phases for the three residents", () => {
    const firstBlink = (kind: ResidentKind) => {
      const clock = new ResidentMotionClock(kind);
      for (let elapsed = 20; elapsed <= 6000; elapsed += 20) {
        if (clock.update(20, false, false) === "blink") return elapsed;
      }
      return 0;
    };
    const phases = (["merchant", "guide", "carpenter"] as const).map(firstBlink);
    expect(new Set(phases).size).toBe(3);
    expect(phases.every(ms => ms >= 4000 && ms <= 6000)).toBe(true);
    expect(firstBlink("guide")).toBe(phases[1]);
  });

  it("freezes a greeting during pause and drops the first resume delta", () => {
    const clock = new ResidentMotionClock("carpenter");
    clock.update(0, true, false); advance(clock, 500, true);
    expect(clock.update(300_000, false, true)).toBe("greet");
    expect(clock.update(300_000, true, false)).toBe("greet");
    expect(advance(clock, 140, true)).toBe("greet");
    expect(advance(clock, 20, true)).toBe("idle");
    // The near=false passed during pause cannot silently rearm a greeting.
    expect(clock.update(0, true, false)).toBe("idle");
  });

  it("clamps long active frames to 100ms instead of catching up through animation", () => {
    const clock = new ResidentMotionClock("merchant");
    clock.update(0, true, false);
    expect(clock.update(50_000, true, false)).toBe("greet");
    expect(advance(clock, 540, true)).toBe("greet");
    expect(advance(clock, 20, true)).toBe("idle");
  });

  it("ignores invalid or negative deltas", () => {
    const clock = new ResidentMotionClock("merchant");
    clock.update(0, true, false);
    for (const delta of [NaN, Infinity, -Infinity, -1]) expect(clock.update(delta, true, false)).toBe("greet");
    expect(advance(clock, 640, true)).toBe("greet");
    expect(advance(clock, 20, true)).toBe("idle");
  });

  it("gives a fresh greeting priority over a blink", () => {
    const clock = new ResidentMotionClock("merchant");
    expect(advance(clock, 4200)).toBe("blink");
    expect(clock.update(0, true, false)).toBe("greet");
    expect(advance(clock, 660, true)).toBe("idle");
  });
});

const ATLAS = "farm-residents-motion-v1";
function fixture(options: { missing?: string; absent?: boolean } = {}) {
  const frames = new Map<string, { realWidth: number; realHeight: number }>();
  for (const kind of ["merchant", "guide", "carpenter"]) for (const pose of ["idle", "blink", "greet"]) {
    if (`${kind}_${pose}` !== options.missing) frames.set(`${kind}_${pose}`, { realWidth: 320, realHeight: 600 });
  }
  const texture = { has: (frame: string) => frames.has(frame), get: (frame: string) => frames.get(frame) };
  const scene = {
    textures: { exists: vi.fn((key: string) => key === ATLAS && !options.absent), get: vi.fn(() => texture) },
    physics: {}, input: {}, time: {}, tweens: {},
  };
  const image = {
    x: 90, y: 120, originX: 0.5, originY: 1, depth: 10.012,
    scaleX: 1, scaleY: 1, texture: { key: "old-fallback" }, frame: { name: "old" },
    setTexture: vi.fn(function(this: any, key: string, frame: string) { this.texture = { key }; this.frame = { name: frame }; return this; }),
    setFrame: vi.fn(function(this: any, frame: string) { this.frame = { name: frame }; return this; }),
    setScale: vi.fn(function(this: any, scale: number) { this.scaleX = scale; this.scaleY = scale; return this; }),
    destroy: vi.fn(),
  };
  return { scene: scene as unknown as Phaser.Scene, image: image as unknown as Phaser.GameObjects.Image, rawImage: image, frames };
}

describe("resident motion render adapter", () => {
  it("uses a complete resident atlas with one uniform height scale and preserves feet and depth", () => {
    const { scene, image, rawImage } = fixture();
    const motion = new ResidentMotion(scene, image, "merchant");
    expect(rawImage.texture.key).toBe(ATLAS);
    expect(rawImage.frame.name).toBe("merchant_idle");
    expect(rawImage.scaleX).toBeCloseTo(44 / 600);
    expect(rawImage.scaleY).toBe(rawImage.scaleX);
    expect([image.x, image.y, image.originX, image.originY, image.depth]).toEqual([90, 120, 0.5, 1, 10.012]);
    motion.update(0, true, false);
    expect(rawImage.frame.name).toBe("merchant_greet");
    expect([image.x, image.y, image.originX, image.originY, image.depth]).toEqual([90, 120, 0.5, 1, 10.012]);
  });

  it.each(["merchant_idle", "merchant_blink", "merchant_greet"])("preserves the full fallback when %s is missing", missing => {
    const { scene, image, rawImage } = fixture({ missing });
    const motion = new ResidentMotion(scene, image, "merchant");
    motion.update(100, true, false); motion.destroy();
    expect(rawImage.setTexture).not.toHaveBeenCalled();
    expect(rawImage.setFrame).not.toHaveBeenCalled();
    expect(rawImage.setScale).not.toHaveBeenCalled();
    expect(rawImage.destroy).not.toHaveBeenCalled();
  });

  it("preserves the fallback when the atlas is absent", () => {
    const { scene, image, rawImage } = fixture({ absent: true });
    const motion = new ResidentMotion(scene, image, "guide");
    motion.update(100, true, false);
    expect(rawImage.setTexture).not.toHaveBeenCalled();
    expect(rawImage.setFrame).not.toHaveBeenCalled();
    expect(rawImage.setScale).not.toHaveBeenCalled();
  });

  it.each([
    ["merchant", "idle", "realHeight", 0],
    ["merchant", "idle", "realHeight", NaN],
    ["merchant", "idle", "realHeight", Infinity],
    ["merchant", "idle", "realHeight", -1],
    ["guide", "blink", "realHeight", 0],
    ["guide", "blink", "realHeight", NaN],
    ["guide", "greet", "realHeight", Infinity],
    ["guide", "greet", "realHeight", -1],
    ["merchant", "greet", "realWidth", 319],
    ["guide", "blink", "realHeight", 601],
  ] as const)("leaves fallback untouched for %s_%s with %s=%s", (kind, pose, dimension, value) => {
    const { scene, image, rawImage, frames } = fixture();
    frames.get(`${kind}_${pose}`)![dimension] = value;
    const texture = rawImage.texture, frame = rawImage.frame;
    const original = [image.x, image.y, image.originX, image.originY, image.depth, image.scaleX, image.scaleY];
    const motion = new ResidentMotion(scene, image, kind);
    motion.update(100, true, false); motion.destroy();
    expect(rawImage.setTexture).not.toHaveBeenCalled();
    expect(rawImage.setScale).not.toHaveBeenCalled();
    expect(rawImage.setFrame).not.toHaveBeenCalled();
    expect(rawImage.destroy).not.toHaveBeenCalled();
    expect(rawImage.texture).toBe(texture); expect(rawImage.frame).toBe(frame);
    expect([image.x, image.y, image.originX, image.originY, image.depth, image.scaleX, image.scaleY]).toEqual(original);
  });

  it.each([0, NaN, Infinity, -1])("rejects a uniform but invalid source canvas height %s", height => {
    const { scene, image, rawImage, frames } = fixture();
    for (const pose of ["idle", "blink", "greet"]) frames.get(`guide_${pose}`)!.realHeight = height;
    const texture = rawImage.texture, frame = rawImage.frame;
    const original = [image.x, image.y, image.originX, image.originY, image.depth, image.scaleX, image.scaleY];
    const motion = new ResidentMotion(scene, image, "guide");
    motion.update(100, true, false); motion.destroy();
    expect(rawImage.setTexture).not.toHaveBeenCalled();
    expect(rawImage.setScale).not.toHaveBeenCalled();
    expect(rawImage.setFrame).not.toHaveBeenCalled();
    expect(rawImage.destroy).not.toHaveBeenCalled();
    expect(rawImage.texture).toBe(texture); expect(rawImage.frame).toBe(frame);
    expect([image.x, image.y, image.originX, image.originY, image.depth, image.scaleX, image.scaleY]).toEqual(original);
  });

  it("does not reapply a frame or scale while the selected pose remains unchanged", () => {
    const { scene, image, rawImage } = fixture();
    const motion = new ResidentMotion(scene, image, "guide");
    rawImage.setFrame.mockClear(); rawImage.setScale.mockClear(); rawImage.setTexture.mockClear();
    for (let tick = 0; tick < 10; tick++) motion.update(20, false, false);
    expect(rawImage.setFrame).not.toHaveBeenCalled();
    motion.update(0, true, false);
    expect(rawImage.setFrame).toHaveBeenCalledTimes(1);
    for (let tick = 0; tick < 10; tick++) motion.update(20, true, false);
    expect(rawImage.setFrame).toHaveBeenCalledTimes(1);
    expect(rawImage.setScale).not.toHaveBeenCalled();
    expect(rawImage.setTexture).not.toHaveBeenCalled();
  });

  it("never destroys its external image and ignores updates after destroy", () => {
    const { scene, image, rawImage } = fixture();
    const motion = new ResidentMotion(scene, image, "carpenter");
    motion.destroy(); motion.destroy();
    rawImage.setFrame.mockClear(); rawImage.setScale.mockClear(); rawImage.setTexture.mockClear();
    for (let tick = 0; tick < 100; tick++) motion.update(100, tick % 2 === 0, false);
    expect(rawImage.setFrame).not.toHaveBeenCalled();
    expect(rawImage.setScale).not.toHaveBeenCalled();
    expect(rawImage.setTexture).not.toHaveBeenCalled();
    expect(rawImage.destroy).not.toHaveBeenCalled();
  });
});
