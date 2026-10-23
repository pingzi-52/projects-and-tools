import { describe, expect, it, vi } from "vitest";
import { bindToolShortcut } from "../src/game/systems/toolShortcut";

function keyboard() {
  const listeners = new Map<string, (event: { repeat: boolean; preventDefault: () => void }) => void>();
  return {
    on(name: string, fn: (event: { repeat: boolean; preventDefault: () => void }) => void) { listeners.set(name, fn); },
    off(name: string, fn: (event: { repeat: boolean; preventDefault: () => void }) => void) { if (listeners.get(name) === fn) listeners.delete(name); },
    press(repeat = false) {
      const event = { repeat, preventDefault: vi.fn() };
      listeners.get("keydown-SPACE")?.(event);
      return event;
    },
  };
}

describe("keyboard tool use", () => {
  it("prevents Space scrolling only during active play, including held repeats", () => {
    const keys = keyboard(); let active = true;
    bindToolShortcut(keys, () => active, vi.fn());
    expect(keys.press().preventDefault).toHaveBeenCalledOnce();
    expect(keys.press(true).preventDefault).toHaveBeenCalledOnce();
    active = false;
    expect(keys.press().preventDefault).not.toHaveBeenCalled();
  });
  it("uses the selected tool once per fresh press, ignoring key repeat", () => {
    const keys = keyboard(), use = vi.fn();
    bindToolShortcut(keys, () => true, use);
    keys.press(); keys.press(true); keys.press(true);
    expect(use).toHaveBeenCalledTimes(1);
    keys.press();
    expect(use).toHaveBeenCalledTimes(2);
  });
  it("does not queue tool use while a menu, transition or background blocks input", () => {
    const keys = keyboard(), use = vi.fn(); let active = false;
    bindToolShortcut(keys, () => active, use);
    keys.press(); active = true; keys.press(true);
    expect(use).not.toHaveBeenCalled();
    keys.press(); expect(use).toHaveBeenCalledTimes(1);
  });
  it("detaches the exact listener on exit and allows a clean re-entry", () => {
    const keys = keyboard(), first = vi.fn(), next = vi.fn();
    const detach = bindToolShortcut(keys, () => true, first);
    detach(); detach(); keys.press();
    expect(first).not.toHaveBeenCalled();
    const detachNext = bindToolShortcut(keys, () => true, next);
    detach(); keys.press();
    expect(next).toHaveBeenCalledTimes(1);
    detachNext(); keys.press(); expect(next).toHaveBeenCalledTimes(1);
  });
});
