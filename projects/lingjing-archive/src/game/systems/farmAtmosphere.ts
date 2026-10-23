import type Phaser from "phaser";

export type AtmosphereWeather = "sunny" | "cloudy" | "rain";
export interface FarmLighting { color: number; alpha: number }

const WARM = 0xd8a064;
const NIGHT = 0x34476f;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function blendColor(from: number, to: number, amount: number): number {
  let color = 0;
  for (const shift of [16, 8, 0]) {
    const a = (from >> shift) & 255, b = (to >> shift) & 255;
    color |= Math.round(a + (b - a) * amount) << shift;
  }
  return color;
}

/** Display-only light: invalid time falls back to morning, never an opaque screen. */
export function lightingForMinute(minute: number, indoor = false): FarmLighting {
  const time = Number.isFinite(minute) ? clamp(minute, 360, 1320) : 360;
  if (indoor) {
    return { color: WARM, alpha: 0.015 + 0.105 * clamp((time - 1020) / 300, 0, 1) };
  }
  if (time < 420) return { color: WARM, alpha: 0.06 * (420 - time) / 60 };
  if (time <= 1020) return { color: WARM, alpha: 0 };
  if (time <= 1140) return { color: WARM, alpha: 0.12 * (time - 1020) / 120 };
  const night = (time - 1140) / 180;
  return { color: blendColor(WARM, NIGHT, night), alpha: 0.12 + night * 0.21 };
}

interface RainDrop { x: number; y: number; speed: number; length: number }

/** Native Phaser shapes only. This layer owns no date, weather or save state. */
export class FarmAtmosphere {
  private readonly ambient: Phaser.GameObjects.Rectangle;
  private readonly rain?: Phaser.GameObjects.Graphics;
  private readonly drops: RainDrop[] = [];
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly indoor = false) {
    const { width, height } = scene.cameras.main;
    this.ambient = scene.add.rectangle(0, 0, width, height, WARM, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(90);
    if (!indoor) {
      this.rain = scene.add.graphics().setScrollFactor(0).setDepth(91);
      for (let i = 0; i < 36; i++) this.drops.push({
        x: (i * 137 + 19) % width, y: (i * 73 + 11) % height,
        speed: 150 + i % 5 * 17, length: 6 + i % 4,
      });
    }
  }

  update(minute: number, weatherType: AtmosphereWeather, delta: number): void {
    if (this.destroyed) return;
    const { width, height } = this.scene.cameras.main;
    const light = lightingForMinute(minute, this.indoor);
    const weatherShade = this.indoor ? 0 : weatherType === "rain" ? 0.07 : weatherType === "cloudy" ? 0.03 : 0;
    const alpha = light.alpha + weatherShade;
    const color = weatherShade > 0 ? blendColor(light.color, 0x8193a5, weatherShade / alpha) : light.color;
    this.ambient.setSize(width, height).setFillStyle(color, Math.min(0.35, alpha));
    if (!this.rain) return;
    this.rain.clear();
    if (weatherType !== "rain") return;
    const seconds = Number.isFinite(delta) ? clamp(delta, 0, 100) / 1000 : 0;
    this.rain.lineStyle(1, 0xc1dbe8, 0.42);
    for (const drop of this.drops) {
      drop.x = (drop.x - seconds * 28 + width) % width;
      drop.y = (drop.y + seconds * drop.speed) % height;
      this.rain.lineBetween(drop.x, drop.y, drop.x - 2, drop.y + drop.length);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ambient.destroy();
    this.rain?.destroy();
    this.drops.length = 0;
  }
}
