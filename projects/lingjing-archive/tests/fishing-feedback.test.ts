import { describe, expect, it } from "vitest";
import { FishingRound } from "../src/domain/services/FishingRound";
import { FishingFeedback, fishingEscapeHelp, fishingCountdown } from "../src/ui/fishingFeedback";

function advance(round: FishingRound, ms: number): void {
  while (ms > 0) { const step = Math.min(100, ms); round.update(step); ms -= step; }
}

describe("active fishing feedback", () => {
  it("reports hook, accepted good and missed reels but ignores cooldown taps", () => {
    const round = new FishingRound(() => 0), feedback = new FishingFeedback();
    round.cast(); feedback.observe(round.state); advance(round, 3000);
    expect(feedback.observe(round.state)?.cue).toBe("fish_bite");
    round.tap(); expect(feedback.observe(round.state)?.message).toContain("上钩");
    advance(round, 300); round.tap();
    expect(feedback.observe(round.state)).toMatchObject({ kind: "good", cue: "fish_reel" });
    round.tap(); expect(feedback.observe(round.state)).toBeNull();
    advance(round, 600); round.tap();
    expect(feedback.observe(round.state)).toMatchObject({ kind: "miss", cue: "error" });
  });

  it("expires pulse and message on active bounded frames only, dropping resumed delta", () => {
    const round = new FishingRound(() => 0), feedback = new FishingFeedback();
    round.cast(); feedback.observe(round.state); advance(round, 3000); feedback.observe(round.state);
    expect(feedback.current?.kind).toBe("bite");
    feedback.update(50000, true); feedback.update(50000, false);
    expect(feedback.current?.kind).toBe("bite");
    feedback.update(50000); expect(feedback.current).not.toBeNull();
    for (let i = 0; i < 20; i++) feedback.update(100);
    expect(feedback.current).toBeNull();
  });

  it("clears stale feedback when round is cancelled or recast", () => {
    const round = new FishingRound(() => 0), feedback = new FishingFeedback();
    round.cast(); feedback.observe(round.state); advance(round, 3000); feedback.observe(round.state);
    round.cancel(); feedback.observe(round.state); expect(feedback.current).toBeNull();
    round.cast(); feedback.observe(round.state); expect(feedback.current).toBeNull();
  });

  it("announces caught once and never treats a countdown tick as a new event", () => {
    const round = new FishingRound(() => 0), feedback = new FishingFeedback();
    round.cast(); feedback.observe(round.state); advance(round, 3000); feedback.observe(round.state); round.tap(); feedback.observe(round.state);
    for (const time of [300, 300, 900]) { advance(round, time); round.tap(); feedback.observe(round.state); }
    expect(feedback.current).toMatchObject({ kind: "caught", cue: "fish_catch" });
    expect(feedback.observe(round.state)).toBeNull();
  });

  it("explains all four exact escape causes and uses whole seconds only for timed actions", () => {
    for (const reason of ["early_pull", "missed_bite", "bad_reels", "reel_timeout"] as const) {
      expect(fishingEscapeHelp(reason)).toContain("没有扣除体力");
    }
    expect(new Set(["early_pull", "missed_bite", "bad_reels", "reel_timeout"].map(reason => fishingEscapeHelp(reason as never))).size).toBe(4);
    const round = new FishingRound(() => 0); round.cast();
    expect(fishingCountdown(round.state)).toBe(""); advance(round, 3000);
    expect(fishingCountdown(round.state)).toBe("提竿剩余 3 秒"); round.tap();
    expect(fishingCountdown(round.state)).toBe("收线剩余 20 秒");
    advance(round, 1001); expect(fishingCountdown(round.state)).toBe("收线剩余 19 秒");
  });
});
