import { describe, expect, it } from "vitest";
import { ActiveNotice } from "../src/game/systems/activeNotice";

function advance(notice: ActiveNotice, milliseconds: number): string {
  let result = "";
  for (let remaining = milliseconds; remaining > 0; remaining -= 100) {
    result = notice.update(Math.min(remaining, 100), false);
  }
  return result;
}

describe("active-play notices", () => {
  it("starts empty and shows a fresh message immediately", () => {
    const notice = new ActiveNotice();
    expect(notice.update(16, false)).toBe("");
    notice.show("获得野蘑菇 ×1");
    expect(notice.update(0, false)).toBe("获得野蘑菇 ×1");
  });

  it("expires at 3500 ms of active time, counting the first active frame", () => {
    const notice = new ActiveNotice();
    notice.show("采集成功");
    expect(advance(notice, 3499)).toBe("采集成功");
    expect(notice.update(1, false)).toBe("");
    expect(notice.update(0, false)).toBe("");
  });

  it("hides while paused for longer than its duration, preserving the exact remainder", () => {
    const notice = new ActiveNotice();
    notice.show("材料不足");
    expect(advance(notice, 3000)).toBe("材料不足");
    for (let frame = 0; frame < 60; frame++) expect(notice.update(100, true)).toBe("");
    expect(notice.update(6000, false)).toBe("材料不足");
    expect(advance(notice, 499)).toBe("材料不足");
    expect(notice.update(1, false)).toBe("");
  });

  it("drops only the first delta after each pause", () => {
    const notice = new ActiveNotice();
    notice.show("消息", 200);
    expect(notice.update(50, false)).toBe("消息");
    expect(notice.update(0, true)).toBe("");
    expect(notice.update(100, false)).toBe("消息");
    expect(notice.update(100, false)).toBe("消息");
    expect(notice.update(0, true)).toBe("");
    expect(notice.update(100, false)).toBe("消息");
    expect(notice.update(50, false)).toBe("");
  });

  it("replaces a previous message and gives the new one its full duration", () => {
    const notice = new ActiveNotice();
    notice.show("旧消息", 300);
    notice.update(100, false);
    notice.show("新消息", 400);
    expect(advance(notice, 399)).toBe("新消息");
    expect(notice.update(1, false)).toBe("");
  });

  it("keeps a replacement issued during a pause until active play resumes", () => {
    const notice = new ActiveNotice();
    notice.show("旧消息", 100);
    notice.update(0, true);
    notice.show("新消息", 100);
    expect(notice.update(5000, true)).toBe("");
    expect(notice.update(5000, false)).toBe("新消息");
    expect(notice.update(99, false)).toBe("新消息");
    expect(notice.update(1, false)).toBe("");
  });

  it("caps a long frame at 100 ms instead of immediately consuming the message", () => {
    const notice = new ActiveNotice();
    notice.show("消息", 101);
    expect(notice.update(5000, false)).toBe("消息");
    expect(notice.update(1, false)).toBe("");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -10])(
    "does not consume time for an invalid delta %s", delta => {
      const notice = new ActiveNotice();
      notice.show("消息", 100);
      expect(notice.update(delta, false)).toBe("消息");
      expect(notice.update(99, false)).toBe("消息");
      expect(notice.update(1, false)).toBe("");
    },
  );

  it("clears a displayed message and allows a new notice to count immediately", () => {
    const notice = new ActiveNotice();
    notice.show("旧消息");
    notice.update(0, true);
    notice.clear();
    expect(notice.update(0, false)).toBe("");
    notice.show("新消息", 100);
    expect(notice.update(100, false)).toBe("");
  });

  it("treats an empty message as cleared", () => {
    const notice = new ActiveNotice();
    notice.show("旧消息");
    notice.show("");
    expect(notice.update(0, false)).toBe("");
  });
});
