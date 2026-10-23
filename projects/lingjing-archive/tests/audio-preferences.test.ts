import { describe, expect, it } from "vitest";
import { AUDIO_PREFERENCES_KEY, DEFAULT_AUDIO_PREFERENCES, loadAudioPreferences, saveAudioPreferences, parseAudioPreferences } from "../src/game/systems/audioPreferences";

describe("independent audio preferences", () => {
  it("uses fresh bounded defaults for absent or unavailable storage", () => {
    const a = loadAudioPreferences(); expect(a).toEqual({ version: 1, muted: false, sfxVolume: 0.5, ambienceVolume: 0.16 });
    a.sfxVolume = 0; expect(loadAudioPreferences()).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(loadAudioPreferences({ getItem() { throw new Error("blocked"); }, setItem() {} })).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });
  it("reads and writes only its own key", () => {
    const keys: string[] = []; let raw: string | null = null;
    const storage = { getItem(key: string) { keys.push(key); return raw; }, setItem(key: string, value: string) { keys.push(key); raw = value; } };
    const prefs = { version: 1 as const, muted: true, sfxVolume: 1, ambienceVolume: 0 };
    expect(saveAudioPreferences(storage, prefs)).toBe(true); expect(loadAudioPreferences(storage)).toEqual(prefs);
    expect(keys).toEqual([AUDIO_PREFERENCES_KEY, AUDIO_PREFERENCES_KEY]); expect(AUDIO_PREFERENCES_KEY).toBe("four-seasons-farm/audio");
  });
  it.each([null, "broken", "null", "[]", "{}", " ".repeat(2049) + JSON.stringify(DEFAULT_AUDIO_PREFERENCES),
    JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, version: 2 }), JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, muted: 1 }),
    JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, sfxVolume: -0.1 }), JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, sfxVolume: 1.1 }),
    JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, ambienceVolume: "0.1" }), JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, ambienceVolume: null }),
    JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, extra: true }), JSON.stringify({ version: 1, muted: false, sfxVolume: 0.5 }),
  ])("rejects corrupt, oversized or incompatible preferences %#", raw => { expect(parseAudioPreferences(raw)).toBeNull(); });
  it("returns failure for write errors and nonfinite settings", () => {
    expect(saveAudioPreferences(undefined, { ...DEFAULT_AUDIO_PREFERENCES })).toBe(false);
    expect(saveAudioPreferences({ getItem() { return null; }, setItem() { throw new Error("full"); } }, { ...DEFAULT_AUDIO_PREFERENCES })).toBe(false);
    const writes: string[] = []; const storage = { getItem() { return null; }, setItem(_key: string, raw: string) { writes.push(raw); } };
    expect(saveAudioPreferences(storage, { ...DEFAULT_AUDIO_PREFERENCES, sfxVolume: NaN })).toBe(false);
    expect(saveAudioPreferences(storage, { ...DEFAULT_AUDIO_PREFERENCES, ambienceVolume: Infinity })).toBe(false); expect(writes).toEqual([]);
  });
});
