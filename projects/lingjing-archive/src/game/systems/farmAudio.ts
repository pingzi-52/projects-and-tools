import { loadAudioPreferences, saveAudioPreferences, validateAudioPreferences, type AudioPreferences, type AudioPreferenceStorage } from "./audioPreferences";

export type AudioCue = "hoe" | "water" | "plant" | "harvest" | "coin" | "confirm" | "error" | "door" | "sleep" | "step" | "fish_bite" | "fish_reel" | "fish_catch";
export type AudioPreferencePatch = Partial<Omit<AudioPreferences, "version">>;
export interface AudioDocument {
  readonly hidden: boolean;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
export interface FarmAudioOptions {
  document?: AudioDocument;
  createContext?: () => AudioContext;
  getStorage?: () => AudioPreferenceStorage | undefined;
  now?: () => number;
}

type Mode = "farm" | "home" | "title";
type Weather = "sunny" | "cloudy" | "rain";
type Graph = { source: AudioScheduledSourceNode; nodes: AudioNode[]; cue?: AudioCue };
type CueSpec = { duration: number; level: number; filter: number; pitch?: number; endPitch?: number; wave?: OscillatorType };
const WORLD_CUES = new Set<AudioCue>(["hoe", "water", "plant", "harvest", "step"]);
const CUES: Record<AudioCue, CueSpec> = {
  hoe: { duration: 0.16, level: 0.18, filter: 430 },
  water: { duration: 0.42, level: 0.13, filter: 2600 },
  plant: { duration: 0.12, level: 0.1, filter: 600 },
  harvest: { duration: 0.22, level: 0.1, filter: 1100 },
  coin: { duration: 0.28, level: 0.07, filter: 1400, pitch: 620, endPitch: 930, wave: "triangle" },
  confirm: { duration: 0.16, level: 0.075, filter: 1000, pitch: 430, endPitch: 540, wave: "sine" },
  error: { duration: 0.2, level: 0.06, filter: 650, pitch: 220, endPitch: 170, wave: "triangle" },
  door: { duration: 0.22, level: 0.14, filter: 380 },
  sleep: { duration: 0.65, level: 0.045, filter: 700, pitch: 260, endPitch: 145, wave: "sine" },
  step: { duration: 0.075, level: 0.075, filter: 180 },
  // Modal interaction cues remain available while the world is paused.
  fish_bite: { duration: 0.21, level: 0.065, filter: 1500, pitch: 680, endPitch: 910, wave: "triangle" },
  fish_reel: { duration: 0.13, level: 0.055, filter: 1050, pitch: 380, endPitch: 570, wave: "sine" },
  fish_catch: { duration: 0.4, level: 0.065, filter: 1500, pitch: 520, endPitch: 1040, wave: "triangle" },
};

function browserStorage(): AudioPreferenceStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
function browserContext(): AudioContext {
  if (typeof window === "undefined") throw new Error("WebAudio unavailable");
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("WebAudio unavailable");
  return new Context();
}

/** One gesture-owned sound graph. Effects are generated live, never queued or stored in the game save. */
export class FarmAudio {
  private readonly doc?: AudioDocument;
  private readonly createContext: () => AudioContext;
  private readonly getStorage: () => AudioPreferenceStorage | undefined;
  private readonly now: () => number;
  private preferences: AudioPreferences;
  private context?: AudioContext;
  private master?: GainNode;
  private effects?: GainNode;
  private ambienceGain?: GainNode;
  private noise?: AudioBuffer;
  private readonly voices = new Set<Graph>();
  private ambience: Graph[] = [];
  private ambienceKey = "";
  private installed = false;
  private disposed = false;
  private resuming = false;
  private paused = false;
  private environment: { mode: Mode; weather: Weather; minute: number } = { mode: "title", weather: "sunny", minute: 360 };
  private lastCueAt = -Infinity;
  private lastStepAt = -Infinity;

  private readonly onGesture: EventListener = event => {
    if (!event.isTrusted || this.disposed || this.doc?.hidden) return;
    this.unlock();
  };
  private readonly onVisibility: EventListener = () => {
    this.applyVolumes();
    if (this.doc?.hidden) this.silence(); else this.refreshAmbience();
  };
  private readonly onStateChange: EventListener = () => {
    if (this.context?.state !== "running") this.silence(); else this.refreshAmbience();
  };

  constructor(options: FarmAudioOptions = {}) {
    this.doc = options.document ?? (typeof document === "undefined" ? undefined : document);
    this.createContext = options.createContext ?? browserContext;
    this.getStorage = options.getStorage ?? browserStorage;
    this.now = options.now ?? (() => performance.now());
    this.preferences = loadAudioPreferences(this.storage());
  }
  get settings(): AudioPreferences { return { ...this.preferences }; }
  get isDestroyed(): boolean { return this.disposed; }

  private storage(): AudioPreferenceStorage | undefined {
    try { return this.getStorage(); } catch { return undefined; }
  }

  updateSettings(patch: AudioPreferencePatch): boolean {
    if (this.disposed) return false;
    try {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)
        || Object.keys(patch).some(key => !["muted", "sfxVolume", "ambienceVolume"].includes(key))) return false;
      const next = validateAudioPreferences({ ...this.preferences, ...patch });
      if (!next) return false;
      // Even private/blocked storage must leave the current session's mute control usable.
      this.preferences = next;
      this.applyVolumes();
      if (next.muted) this.silence(); else this.refreshAmbience();
      return saveAudioPreferences(this.storage(), next);
    } catch { return false; }
  }

  install(): void {
    if (this.disposed || this.installed || !this.doc) return;
    this.installed = true;
    this.doc.addEventListener("pointerdown", this.onGesture, true);
    this.doc.addEventListener("keydown", this.onGesture, true);
    this.doc.addEventListener("visibilitychange", this.onVisibility);
  }

  private unlock(): void {
    try {
      if (!this.context) {
        const context = this.createContext();
        this.context = context;
        try {
          this.master = context.createGain();
          this.effects = context.createGain();
          this.ambienceGain = context.createGain();
          this.effects.connect(this.master);
          this.ambienceGain.connect(this.master);
          this.master.connect(context.destination);
          context.addEventListener("statechange", this.onStateChange);
          this.applyVolumes();
        } catch { this.closeContext(); return; }
      }
      const context = this.context;
      if (context.state === "running") { this.refreshAmbience(); return; }
      if (context.state === "closed" || this.resuming) return;
      this.resuming = true;
      void Promise.resolve(context.resume()).then(() => {
        this.resuming = false;
        if (!this.disposed && this.context === context) this.refreshAmbience();
      }, () => { this.resuming = false; }).catch(() => { this.resuming = false; });
    } catch { this.resuming = false; }
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.effects || !this.ambienceGain) return;
    try {
      const time = this.context.currentTime;
      this.master.gain.cancelScheduledValues(time);
      this.master.gain.setValueAtTime(this.preferences.muted || this.doc?.hidden || this.disposed ? 0 : 1, time);
      this.effects.gain.setTargetAtTime(this.preferences.sfxVolume, time, 0.015);
      this.ambienceGain.gain.setTargetAtTime(this.preferences.ambienceVolume, time, 0.04);
    } catch { /* Audio output failure cannot affect game state. */ }
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const context = this.context!;
      this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * 0.5;
    }
    return this.noise;
  }

  play(cue: AudioCue): void {
    try {
      const context = this.context;
      if (this.disposed || !context || context.state !== "running" || !this.effects
        || this.preferences.muted || this.preferences.sfxVolume === 0 || this.doc?.hidden || !Object.prototype.hasOwnProperty.call(CUES, cue)) return;
      if (WORLD_CUES.has(cue) && (this.paused || this.environment.mode === "title")) return;
      const now = this.now();
      if (!Number.isFinite(now) || now - this.lastCueAt < 60 || cue === "step" && now - this.lastStepAt < 240 || this.voices.size >= 12) return;
      this.lastCueAt = now;
      if (cue === "step") this.lastStepAt = now;
      const spec = CUES[cue];
      const nodes: AudioNode[] = [];
      let graph: Graph | undefined;
      let source: AudioScheduledSourceNode | undefined;
      try {
        const start = context.currentTime;
        if (spec.pitch !== undefined) {
          const tone = context.createOscillator(); source = tone;
          tone.type = spec.wave ?? "sine";
          tone.frequency.setValueAtTime(spec.pitch, start);
          tone.frequency.linearRampToValueAtTime(spec.endPitch ?? spec.pitch, start + spec.duration * 0.8);
        } else {
          const noise = context.createBufferSource(); source = noise; noise.buffer = this.noiseBuffer();
        }
        const filter = context.createBiquadFilter(); nodes.push(filter);
        filter.type = "lowpass"; filter.frequency.setValueAtTime(spec.filter, start); filter.Q.setValueAtTime(0.35, start);
        const envelope = context.createGain(); nodes.push(envelope);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(spec.level, start + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration - 0.01);
        envelope.gain.linearRampToValueAtTime(0, start + spec.duration);
        source.connect(filter); filter.connect(envelope); envelope.connect(this.effects);
        graph = { source, nodes, cue };
        this.voices.add(graph);
        source.onended = () => this.disposeGraph(graph!, false);
        source.start(start); source.stop(start + spec.duration + 0.01);
      } catch {
        if (graph) this.disposeGraph(graph); else {
          if (source) this.disposeGraph({ source, nodes }); else for (const node of nodes) { try { node.disconnect(); } catch {} }
        }
      }
    } catch { /* Cues are optional feedback, never a reason to interrupt interaction. */ }
  }

  setEnvironment(mode: Mode, weather: Weather, minute: number): void {
    if (this.disposed) return;
    const previousMode = this.environment.mode;
    this.environment = { mode, weather, minute: Number.isFinite(minute) ? minute : 360 };
    if (previousMode !== mode) this.stopWorldVoices();
    this.refreshAmbience();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    if (paused) { this.stopAmbience(); this.stopWorldVoices(); } else this.refreshAmbience();
  }

  private refreshAmbience(): void {
    const context = this.context;
    if (this.disposed || !context || context.state !== "running" || !this.ambienceGain || this.preferences.muted
      || this.preferences.ambienceVolume === 0 || this.doc?.hidden || this.paused || this.environment.mode === "title") {
      this.stopAmbience(); return;
    }
    const { mode, weather, minute } = this.environment;
    const night = minute >= 1080;
    const key = `${mode}:${weather}:${night}`;
    if (key === this.ambienceKey) return;
    this.stopAmbience();
    try {
      if (mode === "farm") this.addAmbience("wind", night ? 0.015 : 0.022, weather === "cloudy" ? 550 : 400);
      if (weather === "rain") this.addAmbience("rain", mode === "home" ? 0.014 : 0.045, mode === "home" ? 1200 : 3100);
      this.ambienceKey = key;
    } catch { this.stopAmbience(); }
  }

  private addAmbience(kind: "wind" | "rain", level: number, frequency: number): void {
    const context = this.context!;
    const nodes: AudioNode[] = [];
    const source = context.createBufferSource();
    try {
      source.buffer = this.noiseBuffer(); source.loop = true;
      const filter = context.createBiquadFilter(); nodes.push(filter);
      filter.type = "lowpass"; filter.frequency.setValueAtTime(frequency, context.currentTime); filter.Q.setValueAtTime(0.3, context.currentTime);
      const gain = context.createGain(); nodes.push(gain);
      gain.gain.setValueAtTime(0, context.currentTime); gain.gain.linearRampToValueAtTime(level, context.currentTime + 0.4);
      source.connect(filter); filter.connect(gain); gain.connect(this.ambienceGain!);
      const graph = { source, nodes }; this.ambience.push(graph);
      source.onended = () => { this.disposeGraph(graph, false); this.ambience = this.ambience.filter(item => item !== graph); this.ambienceKey = ""; };
      source.start(context.currentTime, kind === "rain" ? 0.9 : 0);
    } catch { this.disposeGraph({ source, nodes }); throw new Error("Ambience unavailable"); }
  }

  private disposeGraph(graph: Graph, stop = true): void {
    graph.source.onended = null;
    if (stop) { try { graph.source.stop(this.context?.currentTime ?? 0); } catch {} }
    try { graph.source.disconnect(); } catch {}
    for (const node of graph.nodes) { try { node.disconnect(); } catch {} }
    this.voices.delete(graph);
  }
  private stopWorldVoices(): void {
    for (const voice of [...this.voices]) if (voice.cue && WORLD_CUES.has(voice.cue)) this.disposeGraph(voice);
  }
  private stopAmbience(): void {
    const previous = this.ambience; this.ambience = []; this.ambienceKey = "";
    for (const graph of previous) this.disposeGraph(graph);
  }
  private silence(): void {
    this.stopAmbience();
    for (const voice of [...this.voices]) this.disposeGraph(voice);
  }

  private closeContext(): void {
    this.context?.removeEventListener("statechange", this.onStateChange);
    for (const node of [this.master, this.effects, this.ambienceGain]) { try { node?.disconnect(); } catch {} }
    try { void this.context?.close().catch(() => {}); } catch {}
    this.context = undefined; this.noise = undefined;
    this.master = this.effects = this.ambienceGain = undefined;
    this.resuming = false;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.applyVolumes(); this.silence();
    this.doc?.removeEventListener("pointerdown", this.onGesture, true);
    this.doc?.removeEventListener("keydown", this.onGesture, true);
    this.doc?.removeEventListener("visibilitychange", this.onVisibility);
    this.closeContext();
    this.installed = false;
  }
}
let shared: FarmAudio | undefined;
export function getFarmAudio(): FarmAudio {
  if (!shared || shared.isDestroyed) shared = new FarmAudio();
  return shared;
}
