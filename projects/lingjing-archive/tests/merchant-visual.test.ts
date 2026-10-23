import { expect, it } from "vitest";
import type Phaser from "phaser";
import { MerchantResident } from "../src/game/systems/merchantResident";

class Display {
  frame = { realWidth: 576, realHeight: 1096 };
  x = 0; y = 0; scaleX = 1; scaleY = 1;
  get displayWidth() { return this.frame.realWidth * this.scaleX; }
  get displayHeight() { return this.frame.realHeight * this.scaleY; }
  setOrigin() { return this; } setDepth() { return this; } setVisible() { return this; }
  setDisplaySize(w: number, h: number) { this.scaleX = w / this.frame.realWidth; this.scaleY = h / this.frame.realHeight; return this; }
  setScale(scale: number) { this.scaleX = this.scaleY = scale; return this; }
  refreshBody() { return this; } setText() { return this; } destroy() {}
}

it("preserves the tall merchant silhouette and feet while retaining the original collision box", () => {
  const image = new Display(), body = new Display();
  body.frame = { realWidth: 32, realHeight: 28 };
  const labels: Display[] = [];
  const scene = {
    textures: { exists: (key: string) => key === "farm-merchant-v1", get: () => ({ has: () => true }) },
    physics: { add: { staticImage: () => body } },
    add: {
      image: (x: number, y: number) => { image.x = x; image.y = y; return image; },
      text: (x: number, y: number) => { const label = new Display(); label.x = x; label.y = y; labels.push(label); return label; },
    },
  } as unknown as Phaser.Scene;
  new MerchantResident(scene, { row: 12, col: 18, x: 592, y: 400 });
  expect(image.scaleX).toBeCloseTo(image.scaleY, 12);
  expect(image.displayWidth / image.displayHeight).toBeCloseTo(576 / 1096, 12);
  expect(image.displayHeight).toBe(44); expect(image.y).toBe(416);
  expect(labels[0].y).toBeLessThan(image.y - image.displayHeight);
  expect([body.displayWidth, body.displayHeight]).toEqual([32, 28]);
});
