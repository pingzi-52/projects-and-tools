import test from 'node:test';
import assert from 'node:assert/strict';
import { dampingFactor, frameDistance, spinDelta, moonLocalSpin, computeFps, pickScreenTarget } from '../web/solar-motion.mjs';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);
const fullView = { radius: 3, verticalFovDegrees: 60, viewportWidth: 1200, viewportHeight: 800, availableWidth: 1200, availableHeight: 800, fill: 1 };

test('damping gives the same result at 30 Hz and 144 Hz over one second', () => {
  const decay = (hz) => {
    let remaining = 1;
    for (let i = 0; i < hz; i++) remaining *= 1 - dampingFactor(7, 1 / hz);
    return remaining;
  };
  near(decay(30), decay(144));
  assert.ok(decay(30) < 0.002);
});

test('damping handles a paused clock, zero rate and a long frame', () => {
  assert.equal(dampingFactor(7, 0), 0);
  assert.equal(dampingFactor(0, 1), 0);
  assert.equal(dampingFactor(7, 1000), 1);
  assert.ok(dampingFactor(7, 1e-12) > 0);
});

test('damping rejects invalid time and rate', () => {
  for (const [rate, dt] of [[NaN, 1], [1, Infinity], [-1, 1], [1, -1]]) assert.throws(() => dampingFactor(rate, dt), RangeError);
});

test('framing fits a sphere inside a full 60 degree vertical field', () => {
  near(frameDistance(fullView), 6);
});

test('framing respects horizontal space reserved for the info panel', () => {
  const distance = frameDistance({ ...fullView, availableWidth: 300 });
  const angularRadius = Math.asin(fullView.radius / distance);
  const projectedPixelRadius = Math.tan(angularRadius) / Math.tan(Math.PI / 6) * fullView.viewportHeight / 2;
  near(projectedPixelRadius, 150);
  assert.ok(distance > frameDistance(fullView));
});

test('framing handles a bottom sheet on a tall screen and leaves padding', () => {
  const view = { ...fullView, viewportWidth: 390, viewportHeight: 844, availableWidth: 366, availableHeight: 220 };
  const distance = frameDistance(view);
  const angularRadius = Math.asin(view.radius / distance);
  const projectedDiameter = 2 * Math.tan(angularRadius) / Math.tan(Math.PI / 6) * view.viewportHeight / 2;
  near(projectedDiameter, view.availableHeight);
  assert.ok(frameDistance({ ...view, fill: 0.78 }) > distance);
});

test('framing scales linearly with the outer ring radius', () => {
  near(frameDistance({ ...fullView, radius: 6.06 }), frameDistance(fullView) * 2.02);
});

test('framing rejects invalid dimensions, fields of view and fills', () => {
  for (const change of [{radius: 0}, {radius: NaN}, {viewportWidth: 0}, {viewportHeight: -1}, {availableWidth: 0}, {availableHeight: Infinity}, {availableWidth: 1201}, {verticalFovDegrees: 0}, {verticalFovDegrees: 180}, {fill: 0}, {fill: 1.01}]) assert.throws(() => frameDistance({ ...fullView, ...change }), RangeError);
});

test('positive and negative rotation periods produce opposite equal spins', () => {
  assert.ok(spinDelta(23.93, 1) > 0);
  assert.ok(spinDelta(-5832, 1) < 0);
  near(spinDelta(-17.24, 0.5), -spinDelta(17.24, 0.5));
  near(spinDelta(24, 2), 1.38);
  assert.equal(spinDelta(-24, 0), 0);
});

test('spin rejects zero or invalid periods and negative simulation steps', () => {
  for (const [period, dt] of [[0, 1], [NaN, 1], [Infinity, 1], [24, -1], [24, NaN]]) assert.throws(() => spinDelta(period, dt), RangeError);
});

test('the moon keeps the same local face toward Earth for a complete orbit', () => {
  for (let i = 0; i <= 24; i++) {
    const orbit = i * Math.PI / 12;
    const worldFace = orbit + moonLocalSpin();
    const earthDirection = [Math.cos(orbit), -Math.sin(orbit)];
    near(Math.cos(worldFace) * earthDirection[0] - Math.sin(worldFace) * earthDirection[1], 1);
  }
});

test('FPS uses elapsed wall time, including slow frames', () => {
  assert.equal(computeFps(6, 0.6), 10);
  assert.equal(computeFps(60, 1), 60);
  assert.equal(computeFps(0, 0), 0);
  assert.equal(computeFps(0, 1), 0);
});

test('FPS rejects invalid samples', () => {
  for (const [frames, elapsed] of [[-1, 1], [0.5, 1], [NaN, 1], [2, -1], [2, Infinity]]) assert.throws(() => computeFps(frames, elapsed), RangeError);
});

test('a large Saturn 30 pixels away cannot steal the Uranus target under the pointer', () => {
  const candidates = [
    { key: 'saturn', x: 130, y: 100, radius: 22, depth: 0.2 },
    { key: 'uranus', x: 100, y: 100, radius: 4, depth: 0.8 },
  ];
  assert.equal(pickScreenTarget(candidates, { x: 100, y: 100 }), 'uranus');
  assert.equal(pickScreenTarget(candidates.slice(0, 1), { x: 100, y: 100 }), null);
});

test('tiny targets get a ten-pixel circular minimum click radius', () => {
  const candidates = [{ key: 'mercury', x: 0, y: 0, radius: 1, depth: 0.5 }];
  assert.equal(pickScreenTarget(candidates, { x: 6, y: 8 }), 'mercury');
  assert.equal(pickScreenTarget(candidates, { x: 6.1, y: 8 }), null);
  assert.equal(pickScreenTarget(candidates, { x: 11, y: 0 }, 12), 'mercury');
});

test('fallback tolerance adds three pixels but caps large targets at fourteen pixels', () => {
  assert.equal(pickScreenTarget([{ key: 'earth', x: 0, y: 0, radius: 9, depth: 0 }], { x: 12, y: 0 }), 'earth');
  assert.equal(pickScreenTarget([{ key: 'earth', x: 0, y: 0, radius: 9, depth: 0 }], { x: 12.01, y: 0 }), null);
  assert.equal(pickScreenTarget([{ key: 'jupiter', x: 0, y: 0, radius: 100, depth: 0 }], { x: 14, y: 0 }), 'jupiter');
  assert.equal(pickScreenTarget([{ key: 'jupiter', x: 0, y: 0, radius: 100, depth: 0 }], { x: 14.01, y: 0 }), null);
});

test('fallback excludes objects beyond either clipping plane or with invalid projection values', () => {
  const valid = { key: 'valid', x: 0, y: 0, radius: 1, depth: 0 };
  for (const change of [{ depth: -1.001 }, { depth: 1.001 }, { depth: NaN }, { x: NaN }, { y: Infinity }, { radius: -1 }, { radius: NaN }]) {
    assert.equal(pickScreenTarget([{ ...valid, ...change }], { x: 0, y: 0 }), null);
  }
  assert.equal(pickScreenTarget([{ ...valid, depth: -1 }], { x: 0, y: 0 }), 'valid');
  assert.equal(pickScreenTarget([{ ...valid, depth: 1 }], { x: 0, y: 0 }), 'valid');
  assert.equal(pickScreenTarget([], { x: 0, y: 0 }), null);
});

test('two nearby small targets are resolved by pointer distance rather than list order or depth', () => {
  const candidates = [
    { key: 'farther', x: 8, y: 0, radius: 2, depth: -0.5 },
    { key: 'closer', x: 0, y: 3, radius: 2, depth: 0.5 },
  ];
  assert.equal(pickScreenTarget(candidates, { x: 0, y: 0 }), 'closer');
  assert.equal(pickScreenTarget(candidates.toReversed(), { x: 0, y: 0 }), 'closer');
});

test('fallback ignores malformed candidates and rejects invalid pointer input', () => {
  assert.equal(pickScreenTarget([null, {}, { key: 'ok', x: 0, y: 0, radius: 2, depth: 0 }], { x: 0, y: 0 }), 'ok');
  assert.equal(pickScreenTarget([{ key: 'ok', x: 0, y: 0, radius: 2, depth: 0 }], { x: NaN, y: 0 }), null);
  assert.throws(() => pickScreenTarget([], { x: 0, y: 0 }, -1), RangeError);
});
