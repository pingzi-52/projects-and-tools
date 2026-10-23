import { describe, expect, it } from "vitest";
import { FISHES, FISHING_COST } from "../src/data/fishing";
import { FishingRound } from "../src/domain/services/FishingRound";

function advance(round: FishingRound, milliseconds: number): void {
  while (milliseconds > 0) {
    const step = Math.min(100, milliseconds);
    round.update(step);
    milliseconds -= step;
  }
}

function reel(round = new FishingRound(() => 0)): FishingRound {
  expect(round.cast()).toBe(true);
  advance(round, 3000);
  expect(round.state.phase).toBe("bite");
  round.tap();
  expect(round.state.phase).toBe("reeling");
  return round;
}

function catchFish(round = new FishingRound(() => 0)): FishingRound {
  reel(round);
  advance(round, 300);
  round.tap();
  advance(round, 300);
  round.tap();
  advance(round, 900);
  round.tap();
  expect(round.state.phase).toBe("caught");
  return round;
}

describe("FishingRound", () => {
  it("defines the fishing cost, fish names and sale values", () => {
    expect(FISHING_COST).toBe(4);
    expect(FISHES).toEqual([
      { id: "silver_crucian", name: "银鳞鲫", sellPrice: 24 },
      { id: "sun_carp", name: "日纹鲤", sellPrice: 40 },
    ]);
  });

  it("starts idle and exposes a detached state copy", () => {
    const round = new FishingRound();
    expect(round.state).toEqual({ phase: "idle", remainingMs: 0, cursor: 0, inZone: false, progress: 0, misses: 0, fishId: null });
    const state = round.state;
    state.phase = "caught";
    state.progress = 3;
    state.fishId = "sun_carp";
    expect(round.state.phase).toBe("idle");
    expect(round.consumeCatch()).toBeNull();
  });

  it("waits between three and five seconds and rejects repeat casts", () => {
    for (const [random, delay] of [[0, 3000], [0.5, 4000], [1, 5000]]) {
      const round = new FishingRound(() => random);
      expect(round.cast()).toBe(true);
      expect(round.state.remainingMs).toBe(delay);
      expect(round.cast()).toBe(false);
      advance(round, delay - 1);
      expect(round.state.phase).toBe("waiting");
      round.update(1);
      expect(round.state.phase).toBe("bite");
      expect(round.state.remainingMs).toBe(2500);
      expect(round.cast()).toBe(false);
    }
  });

  it("escapes on an early pull and allows a fresh cast", () => {
    const round = new FishingRound(() => 0);
    round.cast();
    round.tap();
    expect(round.state.phase).toBe("escaped");
    expect(round.state.escapeReason).toBe("early_pull");
    expect(round.state.remainingMs).toBe(0);
    expect(round.state.inZone).toBe(false);
    expect(round.consumeCatch()).toBeNull();
    expect(round.cast()).toBe(true);
    expect(round.state.escapeReason).toBeUndefined();
  });

  it("gives a 2500ms bite window and never advances escaped state", () => {
    const round = new FishingRound(() => 0);
    round.cast();
    advance(round, 5499);
    expect(round.state.phase).toBe("bite");
    expect(round.state.remainingMs).toBe(1);
    round.update(100);
    expect(round.state.phase).toBe("escaped");
    expect(round.state.escapeReason).toBe("missed_bite");
    const state = round.state;
    round.tap();
    advance(round, 1000);
    expect(round.state).toEqual(state);
  });

  it("carries only the capped frame remainder across waiting to bite", () => {
    const round = new FishingRound(() => 0);
    round.cast();
    advance(round, 2950);
    round.update(5000);
    expect(round.state.phase).toBe("bite");
    expect(round.state.remainingMs).toBe(2450);
  });

  it("uses a triangular 1800ms cursor and the inclusive safe zone", () => {
    const round = reel();
    expect(round.state.cursor).toBe(0);
    expect(round.state.inZone).toBe(false);
    advance(round, 198);
    expect(round.state.cursor).toBeCloseTo(0.22);
    expect(round.state.inZone).toBe(true);
    advance(round, 504);
    expect(round.state.cursor).toBeCloseTo(0.78);
    expect(round.state.inZone).toBe(true);
    advance(round, 198);
    expect(round.state.cursor).toBe(1);
    expect(round.state.inZone).toBe(false);
    advance(round, 900);
    expect(round.state.cursor).toBe(0);
  });

  it("debounces every tap for 250ms, including the initial hook", () => {
    const round = reel();
    advance(round, 249);
    round.tap();
    expect(round.state.progress).toBe(0);
    round.update(1);
    round.tap();
    expect(round.state.progress).toBe(1);
    round.tap();
    advance(round, 249);
    round.tap();
    expect(round.state.progress).toBe(1);
    round.update(1);
    round.tap();
    expect(round.state.progress).toBe(2);
  });

  it("catches with three safe taps and consumes the fish exactly once", () => {
    const round = catchFish();
    expect(round.state.progress).toBe(3);
    expect(round.state.fishId).toBe("silver_crucian");
    expect(round.state.remainingMs).toBe(0);
    expect(round.state.inZone).toBe(false);
    expect(round.cast()).toBe(false);
    const caught = round.state;
    advance(round, 30000);
    round.tap();
    expect(round.state).toEqual(caught);
    expect(round.consumeCatch()).toBe("silver_crucian");
    expect(round.state.phase).toBe("idle");
    expect(round.state.fishId).toBeNull();
    expect(round.consumeCatch()).toBeNull();
    expect(round.cast()).toBe(true);
  });

  it("selects silver at 64.9% and sun carp from the 65% boundary", () => {
    for (const [sample, expected] of [[0.649, "silver_crucian"], [0.65, "sun_carp"]] as const) {
      let calls = 0;
      const round = catchFish(new FishingRound(() => calls++ === 0 ? 0 : sample));
      expect(round.consumeCatch()).toBe(expected);
      expect(calls).toBe(2);
    }
  });

  it("escapes after five unsafe taps without making progress", () => {
    const round = reel();
    advance(round, 900);
    for (let i = 0; i < 5; i++) {
      round.tap();
      if (i < 4) advance(round, 900);
    }
    expect(round.state.phase).toBe("escaped");
    expect(round.state.misses).toBe(5);
    expect(round.state.escapeReason).toBe("bad_reels");
    expect(round.state.progress).toBe(0);
    expect(round.consumeCatch()).toBeNull();
  });

  it("gives reeling twenty seconds before the fish escapes", () => {
    const round = reel();
    expect(round.state.remainingMs).toBe(20000);
    expect(round.cast()).toBe(false);
    advance(round, 19999);
    expect(round.state.remainingMs).toBe(1);
    round.update(100);
    expect(round.state.phase).toBe("escaped");
    expect(round.state.remainingMs).toBe(0);
    expect(round.state.escapeReason).toBe("reel_timeout");
  });

  it("ignores invalid deltas and limits one frame to 100ms", () => {
    const round = new FishingRound(() => 0);
    round.cast();
    const initial = round.state;
    for (const delta of [-1, NaN, Infinity, -Infinity, 0]) round.update(delta);
    expect(round.state).toEqual(initial);
    round.update(Number.MAX_VALUE);
    expect(round.state.remainingMs).toBe(2900);
  });

  it("freezes waiting and drops the first resumed frame", () => {
    const round = new FishingRound(() => 0);
    round.cast();
    round.update(100);
    const beforePause = round.state;
    round.update(600000, true);
    round.update(100, true);
    expect(round.state).toEqual(beforePause);
    round.update(600000, false);
    expect(round.state).toEqual(beforePause);
    round.update(100);
    expect(round.state.remainingMs).toBe(2800);
  });

  it("freezes bite and reeling timers, cursor and tap cooldown while paused", () => {
    const round = new FishingRound(() => 0);
    round.cast();
    advance(round, 3000);
    const bite = round.state;
    round.update(30000, true);
    round.update(30000);
    expect(round.state).toEqual(bite);
    round.tap();
    advance(round, 200);
    const reeling = round.state;
    round.update(30000, true);
    round.update(30000);
    expect(round.state).toEqual(reeling);
    round.tap();
    expect(round.state.progress).toBe(0);
    round.update(50);
    round.tap();
    expect(round.state.progress).toBe(1);
  });

  it("cancels every phase to a clean idle state", () => {
    for (const prepare of [
      (r: FishingRound) => r.cast(),
      (r: FishingRound) => { r.cast(); advance(r, 3000); },
      (r: FishingRound) => reel(r),
      (r: FishingRound) => catchFish(r),
      (r: FishingRound) => { r.cast(); r.tap(); },
    ]) {
      const round = new FishingRound(() => 0);
      prepare(round);
      round.cancel();
      expect(round.state).toEqual({ phase: "idle", remainingMs: 0, cursor: 0, inZone: false, progress: 0, misses: 0, fishId: null });
      expect(round.consumeCatch()).toBeNull();
      expect(round.cast()).toBe(true);
    }
  });

  it("uses a stable bounded fallback for invalid random samples", () => {
    for (const invalid of [NaN, Infinity, -Infinity, -1, Number.MAX_VALUE]) {
      const round = new FishingRound(() => invalid);
      round.cast();
      expect(round.state.remainingMs).toBe(4000);
      advance(round, 4000);
      round.tap();
      advance(round, 300); round.tap();
      advance(round, 300); round.tap();
      advance(round, 900); round.tap();
      expect(round.consumeCatch()).toBe("silver_crucian");
    }
  });
});
