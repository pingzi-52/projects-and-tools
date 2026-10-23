import { describe, expect, it, vi } from "vitest";
import { TreeOcclusion, type TreeImage } from "../src/game/systems/treeOcclusion";

function tree(x = 100, y = 200, alpha = 1) {
  const image = {
    x, y, displayWidth: 80, displayHeight: 120, alpha,
    setAlpha: vi.fn((value: number) => { image.alpha = value; return image; }),
    destroy: vi.fn(),
  };
  return image;
}

const BEHIND = { x: 100, y: 120 };
const AWAY = { x: 400, y: 120 };
function finish(controller: TreeOcclusion, player = BEHIND): void {
  controller.update(player, 100, false); controller.update(player, 80, false);
}

describe("forest tree occlusion", () => {
  it("fades only a foreground canopy intersecting the player display envelope over 180ms", () => {
    const image = tree(), controller = new TreeOcclusion([image]);
    controller.update(BEHIND, 100, false);
    expect(image.alpha).toBeCloseTo(1 - 0.75 * 100 / 180);
    controller.update(BEHIND, 80, false);
    expect(image.alpha).toBeCloseTo(0.25);
  });

  it.each([
    ["tree north of player", { x: 100, y: 190 }],
    ["same foot line", { x: 100, y: 184 }],
    ["left boundary tangent", { x: 44, y: 120 }],
    ["right boundary tangent", { x: 156, y: 120 }],
    ["top boundary tangent", { x: 100, y: 64 }],
    ["outside canopy", AWAY],
  ] as const)("leaves the tree unchanged when %s", (_description, position) => {
    const image = tree(), controller = new TreeOcclusion([image]);
    finish(controller, position);
    expect(image.alpha).toBe(1);
    expect(image.setAlpha).not.toHaveBeenCalled();
  });

  it.each([
    { x: 44.001, y: 120 }, { x: 155.999, y: 120 }, { x: 100, y: 64.001 },
  ])("recognizes a strict intersection immediately inside the boundary %#", position => {
    const image = tree(), controller = new TreeOcclusion([image]);
    finish(controller, position);
    expect(image.alpha).toBeCloseTo(0.25);
  });

  it("handles overlapping trees independently and leaves non-occluding trees alone", () => {
    const first = tree(), second = tree(110, 180, 0.8), northern = tree(100, 130), distant = tree(500, 200);
    const controller = new TreeOcclusion([first, second, northern, distant]);
    finish(controller);
    expect(first.alpha).toBeCloseTo(0.25);
    expect(second.alpha).toBeCloseTo(0.2);
    expect(northern.alpha).toBe(1); expect(northern.setAlpha).not.toHaveBeenCalled();
    expect(distant.alpha).toBe(1); expect(distant.setAlpha).not.toHaveBeenCalled();
  });

  it("restores the original alpha smoothly after the player leaves", () => {
    const image = tree(100, 200, 0.6), controller = new TreeOcclusion([image]);
    finish(controller);
    expect(image.alpha).toBeCloseTo(0.15);
    controller.update(AWAY, 100, false);
    expect(image.alpha).toBeCloseTo(0.15 + 0.45 * 100 / 180);
    controller.update(AWAY, 80, false);
    expect(image.alpha).toBeCloseTo(0.6);
  });

  it("freezes during pause and ignores the first resume delta", () => {
    const image = tree(), controller = new TreeOcclusion([image]);
    controller.update(BEHIND, 80, false);
    const pausedAlpha = image.alpha;
    image.setAlpha.mockClear();
    controller.update(AWAY, 90_000, true);
    controller.update(AWAY, 90_000, true);
    expect(image.alpha).toBe(pausedAlpha);
    controller.update(AWAY, 90_000, false);
    expect(image.alpha).toBe(pausedAlpha);
    expect(image.setAlpha).not.toHaveBeenCalled();
    controller.update(AWAY, 80, false);
    expect(image.alpha).toBeCloseTo(1);
  });

  it("clamps a long active frame to 100ms without catching up", () => {
    const image = tree(), controller = new TreeOcclusion([image]);
    controller.update(BEHIND, 50_000, false);
    expect(image.alpha).toBeCloseTo(1 - 0.75 * 100 / 180);
    controller.update(BEHIND, 80, false);
    expect(image.alpha).toBeCloseTo(0.25);
  });

  it.each([NaN, Infinity, -Infinity, -1, 0])("does not advance for delta %s", delta => {
    const image = tree(), controller = new TreeOcclusion([image]);
    controller.update(BEHIND, delta, false);
    expect(image.alpha).toBe(1); expect(image.setAlpha).not.toHaveBeenCalled();
  });

  it.each([
    { x: NaN, y: 120 }, { x: 100, y: NaN }, { x: Infinity, y: 120 }, { x: 100, y: -Infinity },
  ])("restores occlusion safely for invalid player coordinates %#", position => {
    const image = tree(), controller = new TreeOcclusion([image]);
    finish(controller);
    finish(controller, position);
    expect(image.alpha).toBeCloseTo(1);
  });

  it("caches tree bounds at construction without changing geometry or creating dependencies", () => {
    const image = tree(), originalSetAlpha = image.setAlpha;
    const controller = new TreeOcclusion([image] satisfies readonly TreeImage[]);
    expect(image.setAlpha).not.toHaveBeenCalled();
    image.x = 1000; image.displayWidth = 1;
    finish(controller);
    expect(image.alpha).toBeCloseTo(0.25);
    expect(image.x).toBe(1000); expect(image.y).toBe(200);
    expect(image.displayWidth).toBe(1); expect(image.displayHeight).toBe(120);
    expect(image.setAlpha).toBe(originalSetAlpha);
    expect(image.destroy).not.toHaveBeenCalled();
  });

  it("does not repeatedly set alpha at either settled endpoint or for zero-base-alpha trees", () => {
    const image = tree(), transparent = tree(100, 200, 0), controller = new TreeOcclusion([image, transparent]);
    finish(controller); image.setAlpha.mockClear();
    for (let tick = 0; tick < 10; tick++) controller.update(BEHIND, 16, false);
    expect(image.setAlpha).not.toHaveBeenCalled();
    expect(transparent.setAlpha).not.toHaveBeenCalled();
    finish(controller, AWAY); image.setAlpha.mockClear();
    for (let tick = 0; tick < 10; tick++) controller.update(AWAY, 16, false);
    expect(image.setAlpha).not.toHaveBeenCalled();
  });

  it("restores original alpha once at destroy and never destroys or touches trees afterwards", () => {
    const image = tree(100, 200, 0.6), untouched = tree(500, 200, 0.8);
    const controller = new TreeOcclusion([image, untouched]);
    finish(controller); image.setAlpha.mockClear();
    controller.destroy();
    expect(image.alpha).toBe(0.6); expect(image.setAlpha).toHaveBeenCalledExactlyOnceWith(0.6);
    expect(untouched.setAlpha).not.toHaveBeenCalled();
    image.setAlpha.mockClear();
    controller.destroy();
    for (let tick = 0; tick < 10; tick++) controller.update(BEHIND, 100, false);
    expect(image.setAlpha).not.toHaveBeenCalled();
    expect(image.destroy).not.toHaveBeenCalled(); expect(untouched.destroy).not.toHaveBeenCalled();
  });

  it("accepts an empty image list and does not mutate the provided list", () => {
    const image = tree(), images = Object.freeze([image]);
    const empty = new TreeOcclusion([]), controller = new TreeOcclusion(images);
    finish(empty); empty.destroy(); finish(controller); controller.destroy();
    expect(images).toEqual([image]);
  });
});
