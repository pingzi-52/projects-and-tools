import { describe, expect, it } from "vitest";
import { FarmAudio, type AudioCue } from "../src/game/systems/farmAudio";
import { AUDIO_PREFERENCES_KEY, DEFAULT_AUDIO_PREFERENCES } from "../src/game/systems/audioPreferences";

class EventTargetFake {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  hidden = false;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, trusted = true) {
    const event = { type, isTrusted: trusted } as Event;
    for (const listener of [...this.listeners.get(type) ?? []]) typeof listener === "function" ? listener(event) : listener.handleEvent(event);
  }
  count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}
class Param {
  value = 0; events: [string, number, number][] = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push(["set", value, time]); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(["linear", value, time]); return this; }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(["exponential", value, time]); return this; }
  setTargetAtTime(value: number, time: number) { this.value = value; this.events.push(["target", value, time]); return this; }
  cancelScheduledValues() { return this; }
}
class NodeFake {
  disconnected = false; connections: NodeFake[] = [];
  connect(node: NodeFake) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
}
class GainFake extends NodeFake { gain = new Param(); }
class FilterFake extends NodeFake { type = "lowpass"; frequency = new Param(); Q = new Param(); }
class SourceFake extends NodeFake {
  kind: "noise" | "tone"; loop = false; buffer: unknown; type = "sine"; frequency = new Param();
  starts: number[][] = []; stops: number[] = []; onended: (() => void) | null = null;
  constructor(kind: "noise" | "tone") { super(); this.kind = kind; }
  start(...times: number[]) { this.starts.push(times); }
  stop(time = 0) { this.stops.push(time); }
  end() { this.onended?.(); }
}
class ContextFake extends EventTargetFake {
  state: AudioContextState = "suspended"; currentTime = 0; sampleRate = 100; destination = new NodeFake();
  gains: GainFake[] = []; sources: SourceFake[] = []; filters: FilterFake[] = []; resumeCalls = 0; closeCalls = 0;
  rejectResume = false; throwResume = false;
  createGain() { const node = new GainFake(); this.gains.push(node); return node; }
  createBiquadFilter() { const node = new FilterFake(); this.filters.push(node); return node; }
  createOscillator() { const node = new SourceFake("tone"); this.sources.push(node); return node; }
  createBufferSource() { const node = new SourceFake("noise"); this.sources.push(node); return node; }
  createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData() { return data; } }; }
  resume() { this.resumeCalls++; if (this.throwResume) throw new Error("blocked"); if (this.rejectResume) return Promise.reject(new Error("blocked")); this.state = "running"; return Promise.resolve(); }
  close() { this.closeCalls++; this.state = "closed"; return Promise.resolve(); }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function setup() {
  const doc = new EventTargetFake(), context = new ContextFake(); let constructed = 0, milliseconds = 1000; const writes = new Map<string, string>();
  const audio = new FarmAudio({ document: doc, createContext: () => { constructed++; return context as unknown as AudioContext; }, now: () => milliseconds,
    getStorage: () => ({ getItem: key => writes.get(key) ?? null, setItem: (key, value) => { writes.set(key, value); } }) });
  const tick = (amount: number) => { milliseconds += amount; context.currentTime += amount / 1000; };
  const unlock = async () => { audio.install(); doc.emit("pointerdown"); await flush(); };
  return { audio, doc, context, tick, unlock, writes, constructed: () => constructed };
}

describe("gesture-owned synthesized farm sound", () => {
  it("plays distinct bounded fishing interaction tones through modal pause but honors hidden and mute", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "sunny", 600); t.audio.setPaused(true);
    const before = t.context.sources.length;
    for(const cue of ["fish_bite", "fish_reel", "fish_catch"] as const) { t.tick(1000); t.audio.play(cue); }
    const tones = t.context.sources.slice(before);
    expect(tones).toHaveLength(3);
    expect(new Set(tones.map(source => source.frequency.events[0][1])).size).toBe(3);
    for(const tone of tones) { expect(tone.kind).toBe("tone"); expect(tone.stops[0]-tone.starts[0][0]).toBeLessThan(0.5); }
    t.doc.hidden=true; t.doc.emit("visibilitychange"); t.tick(1000); t.audio.play("fish_bite");
    expect(t.context.sources).toHaveLength(before+3);
    expect(tones.every(tone=>tone.disconnected)).toBe(true);
    t.doc.hidden=false; t.doc.emit("visibilitychange"); t.audio.updateSettings({muted:true});
    t.tick(1000); t.audio.play("fish_catch"); expect(t.context.sources).toHaveLength(before+3);
    t.audio.destroy();
  });
  it("never constructs a context before a trusted gesture and installs listeners once", async () => {
    const t = setup(); t.audio.install(); t.audio.install(); t.audio.play("confirm"); t.audio.setEnvironment("farm", "rain", 600);
    expect(t.constructed()).toBe(0); expect(t.doc.count()).toBe(3);
    t.doc.emit("pointerdown", false); expect(t.constructed()).toBe(0);
    t.doc.emit("keydown"); await flush(); t.doc.emit("pointerdown"); await flush();
    expect(t.constructed()).toBe(1); expect(t.context.resumeCalls).toBe(1); t.audio.destroy();
  });
  it.each(["reject", "throw"])("catches %s resume failures, drops cues and retries on the next gesture", async failure => {
    const t = setup(); t.context.rejectResume = failure === "reject"; t.context.throwResume = failure === "throw";
    await t.unlock(); t.audio.play("hoe"); expect(t.context.sources).toHaveLength(0);
    t.context.rejectResume = t.context.throwResume = false; t.doc.emit("keydown"); await flush();
    t.audio.play("confirm"); expect(t.constructed()).toBe(1); expect(t.context.sources).toHaveLength(1); t.audio.destroy();
  });
  it("drops locked cues instead of replaying them after unlock", async () => {
    const t = setup(); t.audio.play("hoe"); t.audio.play("harvest"); await t.unlock();
    expect(t.context.sources).toHaveLength(0); t.audio.play("confirm"); expect(t.context.sources).toHaveLength(1); t.audio.destroy();
  });
  it("limits step to 240ms and all fast cues to 60ms without queues", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "sunny", 600);
    const background = t.context.sources.length; t.audio.play("step"); t.tick(239); t.audio.play("step"); expect(t.context.sources.length).toBe(background + 1);
    t.tick(1); t.audio.play("step"); expect(t.context.sources.length).toBe(background + 2);
    t.tick(60); t.audio.play("hoe"); t.tick(59); t.audio.play("water"); expect(t.context.sources.length).toBe(background + 3);
    t.tick(1); t.audio.play("water"); expect(t.context.sources.length).toBe(background + 4); t.audio.destroy();
  });
  it("every one-shot source receives a bounded stop time and disconnects after ending", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("home", "sunny", 600);
    for (const cue of ["hoe", "water", "plant", "harvest", "coin", "confirm", "error", "door", "sleep", "step"] as AudioCue[]) { t.tick(1000); t.audio.play(cue); }
    expect(t.context.sources).toHaveLength(10);
    for (const source of t.context.sources) { expect(source.stops.length).toBeGreaterThan(0); expect(source.stops[0]).toBeLessThanOrEqual(source.starts[0][0] + 1.1); source.end(); expect(source.disconnected).toBe(true); }
    expect(t.context.filters.every(node => node.disconnected)).toBe(true); t.audio.destroy();
  });
  it("does not recreate ambience or cancel menu previews on identical frame-by-frame environment updates", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "rain", 600);
    const sources = t.context.sources.slice(); expect(sources.length).toBeLessThanOrEqual(2); expect(sources.length).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) { t.audio.setPaused(false); t.audio.setEnvironment("farm", "rain", 610); }
    expect(t.context.sources).toHaveLength(sources.length); expect(sources.every(source => source.stops.length === 0)).toBe(true);
    t.audio.setPaused(true); expect(sources.every(source => source.disconnected)).toBe(true);
    t.audio.play("confirm"); const preview = t.context.sources[t.context.sources.length - 1]!; expect(preview.loop).toBe(false);
    for (let i = 0; i < 60; i++) { t.audio.setPaused(true); t.audio.setEnvironment("farm", "rain", 610); }
    expect(preview.stops).toHaveLength(1); t.audio.destroy();
  });
  it("pause/title silence ambience and game cues while allowing explicit menu confirms", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "rain", 600); t.audio.setPaused(true);
    const count = t.context.sources.length; t.audio.play("hoe"); t.audio.play("step"); expect(t.context.sources).toHaveLength(count);
    t.audio.play("confirm"); expect(t.context.sources).toHaveLength(count + 1);
    t.tick(1000); t.audio.setEnvironment("title", "sunny", 600); t.audio.setPaused(false); const afterTitle = t.context.sources.length;
    t.audio.play("step"); expect(t.context.sources).toHaveLength(afterTitle); t.audio.play("coin"); expect(t.context.sources.length).toBe(afterTitle + 1); t.audio.destroy();
  });
  it("mute silences the master gain immediately and stops already sounding sources", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "rain", 600); t.audio.play("water");
    const sounding = t.context.sources.slice(); expect(t.audio.updateSettings({ muted: true })).toBe(true);
    expect(t.context.gains[0].gain.value).toBe(0); expect(sounding.every(source => source.disconnected)).toBe(true);
    const count = t.context.sources.length; t.tick(1000); t.audio.play("confirm"); expect(t.context.sources).toHaveLength(count);
    expect(t.audio.updateSettings({ muted: false })).toBe(true); expect(t.context.sources.length).toBeGreaterThan(count); t.audio.destroy();
  });
  it("hidden tabs drop all sounds and resume ambience without replaying old effects", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "rain", 600); t.audio.play("hoe"); const old = t.context.sources.slice();
    t.doc.hidden = true; t.doc.emit("visibilitychange"); expect(old.every(source => source.disconnected)).toBe(true);
    const count = t.context.sources.length; t.tick(1000); t.audio.play("confirm"); expect(t.context.sources).toHaveLength(count);
    t.doc.hidden = false; t.doc.emit("visibilitychange"); const newSources = t.context.sources.slice(count);
    expect(newSources.length).toBeLessThanOrEqual(2); expect(newSources.every(source => source.loop)).toBe(true); t.audio.destroy();
  });
  it("keeps valid live settings when persistence fails, rejects invalid patches and returns detached snapshots", async () => {
    const t = setup(); await t.unlock(); const prefs = t.audio.settings; prefs.muted = true; expect(t.audio.settings.muted).toBe(false);
    expect(t.audio.updateSettings({ sfxVolume: 0.25, ambienceVolume: 0.1 })).toBe(true); expect(t.writes.has(AUDIO_PREFERENCES_KEY)).toBe(true);
    const before = t.audio.settings; expect(t.audio.updateSettings({ sfxVolume: 2 })).toBe(false); expect(t.audio.settings).toEqual(before);
    expect(t.audio.updateSettings({ version: 2 } as never)).toBe(false);
    const unavailable = new FarmAudio({ document: t.doc, getStorage: () => { throw new Error("blocked"); }, createContext: () => t.context as unknown as AudioContext });
    expect(unavailable.settings).toEqual(DEFAULT_AUDIO_PREFERENCES); expect(unavailable.updateSettings({ muted: true })).toBe(false); expect(unavailable.settings.muted).toBe(true);
    unavailable.destroy(); t.audio.destroy();
  });
  it("destroy cleans listeners, all nodes and context, is idempotent and never reopens", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "rain", 600); t.audio.play("harvest");
    t.audio.destroy(); await flush(); t.audio.destroy(); t.audio.install(); t.doc.emit("pointerdown"); t.audio.play("confirm");
    expect(t.doc.count()).toBe(0); expect(t.context.count()).toBe(0); expect(t.context.closeCalls).toBe(1); expect(t.constructed()).toBe(1);
    expect(t.context.sources.every(source => source.disconnected)).toBe(true); expect(t.context.gains.every(node => node.disconnected)).toBe(true);
  });

  it("keeps explicitly allowed door, sleep and menu effects through pause and scene changes", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "sunny", 600);
    const persistent: SourceFake[] = [];
    for (const cue of ["door", "sleep", "confirm"] as const) { t.tick(100); t.audio.play(cue); persistent.push(t.context.sources[t.context.sources.length - 1]); }
    t.tick(100); t.audio.play("water"); const world = t.context.sources[t.context.sources.length - 1];
    t.audio.setPaused(true); t.audio.setEnvironment("home", "sunny", 600); t.audio.setEnvironment("title", "sunny", 600);
    expect(world.disconnected).toBe(true);
    for (const source of persistent) { expect(source.disconnected).toBe(false); expect(source.stops).toHaveLength(1); }
    t.audio.destroy();
  });

  it("suspension discards active effects and only restarts ambience when running", async () => {
    const t = setup(); await t.unlock(); t.audio.setEnvironment("farm", "rain", 600); t.audio.play("harvest");
    const old = t.context.sources.slice(); t.context.state = "suspended"; t.context.emit("statechange");
    expect(old.every(source => source.disconnected)).toBe(true);
    t.tick(1000); t.audio.play("confirm"); expect(t.context.sources).toHaveLength(old.length);
    t.context.state = "running"; t.context.emit("statechange"); const resumed = t.context.sources.slice(old.length);
    expect(resumed).toHaveLength(2); expect(resumed.every(source => source.loop)).toBe(true); t.audio.destroy();
  });

  it("caps simultaneous one-shot graphs and permits new sounds after ended cleanup", async () => {
    const t = setup(); await t.unlock();
    for (let i = 0; i < 30; i++) { t.tick(60); t.audio.play("confirm"); }
    expect(t.context.sources).toHaveLength(12);
    t.context.sources[0].end(); t.tick(60); t.audio.play("confirm"); expect(t.context.sources).toHaveLength(13); t.audio.destroy();
  });

  it("closes and disconnects a partially initialized context before retrying a fresh gesture", async () => {
    const doc = new EventTargetFake(), failed = new ContextFake(), working = new ContextFake(); let created = 0, gains = 0;
    const createGain = failed.createGain.bind(failed);
    failed.createGain = () => { if (++gains === 2) throw new Error("graph allocation"); return createGain(); };
    const audio = new FarmAudio({ document: doc, createContext: () => (++created === 1 ? failed : working) as unknown as AudioContext });
    audio.install(); expect(() => doc.emit("pointerdown")).not.toThrow(); await flush();
    expect(failed.closeCalls).toBe(1); expect(failed.gains.every(node => node.disconnected)).toBe(true);
    doc.emit("pointerdown"); await flush(); audio.play("confirm"); expect(created).toBe(2); expect(working.sources).toHaveLength(1); audio.destroy();
  });
});
