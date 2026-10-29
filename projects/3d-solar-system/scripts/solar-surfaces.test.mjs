import assert from 'node:assert/strict';
import test from 'node:test';
import {createSurfaceData, sampleSurface} from '../web/solar-surfaces.mjs';

const keys = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon', 'sun'];

test('planet surfaces produce deterministic, finite color and relief', () => {
  for (const key of keys) {
    const first = createSurfaceData(key, 48, 24);
    const second = createSurfaceData(key, 48, 24);
    assert.equal(first.width, 48);
    assert.equal(first.height, 24);
    assert.ok(first.color instanceof Uint8ClampedArray);
    assert.ok(first.bump instanceof Uint8ClampedArray);
    assert.equal(first.color.length, 48 * 24 * 4);
    assert.equal(first.bump.length, first.color.length);
    assert.deepEqual(first.color, second.color);
    assert.deepEqual(first.bump, second.bump);
    for (let i = 0; i < first.color.length; i += 4) {
      assert.equal(first.color[i + 3], 255);
      assert.equal(first.bump[i + 3], 255);
    }
    const {color, height} = sampleSurface(key, 0.34, 0.63);
    assert.equal(color.length, 3);
    assert.ok(color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255));
    assert.ok(Number.isFinite(height) && height >= 0 && height <= 1);
  }
});

test('longitude wraps continuously and converges to consistent poles', () => {
  for (const key of keys) {
    for (const v of [0, 0.13, 0.5, 0.82, 1]) {
      assert.deepEqual(sampleSurface(key, 0, v), sampleSurface(key, 1, v));
      assert.deepEqual(sampleSurface(key, -0.25, v), sampleSurface(key, 0.75, v));
      const left = sampleSurface(key, 1 - 1e-7, v);
      const right = sampleSurface(key, 1e-7, v);
      assert.ok(left.color.every((c, i) => Math.abs(c - right.color[i]) <= 1), key);
      assert.ok(Math.abs(left.height - right.height) < 0.001, key);
    }
    for (const v of [0, 1]) {
      assert.deepEqual(sampleSurface(key, 0.1, v), sampleSurface(key, 0.7, v), key);
    }
  }
});

test('each planet has distinct color information and spatial surface detail', () => {
  const signatures = new Set();
  for (const key of keys) {
    const {color, bump} = createSurfaceData(key, 64, 32);
    signatures.add(Buffer.from(color).toString('base64'));
    const colors = new Set();
    const heights = new Set();
    for (let i = 0; i < color.length; i += 4) {
      colors.add(`${color[i]},${color[i + 1]},${color[i + 2]}`);
      heights.add(bump[i]);
    }
    assert.ok(colors.size > 30, `${key} should have visible surface variation`);
    assert.ok(heights.size > 5, `${key} should have relief detail`);
  }
  assert.equal(signatures.size, keys.length);
});

test('texture generation rejects unknown bodies and unbounded allocations', () => {
  for (const args of [['earth', 32, 16], ['moon', 0, 16], ['moon', 1.5, 16], ['moon', 4096, 4096], ['moon', NaN, 16]]) {
    assert.throws(() => createSurfaceData(...args));
  }
  assert.throws(() => sampleSurface('moon', Infinity, 0.5));
  assert.throws(() => sampleSurface('moon', 0.5, NaN));
});
