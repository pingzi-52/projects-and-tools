export interface AudioPreferences { version: 1; muted: boolean; sfxVolume: number; ambienceVolume: number }
export interface AudioPreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const AUDIO_PREFERENCES_KEY = "four-seasons-farm/audio";
export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = Object.freeze({ version: 1, muted: false, sfxVolume: 0.5, ambienceVolume: 0.16 });
const MAX_BYTES = 1024;
const FIELDS = ["version", "muted", "sfxVolume", "ambienceVolume"];
const volume = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function validateAudioPreferences(value: unknown): AudioPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== FIELDS.length || !FIELDS.every(key => Object.prototype.hasOwnProperty.call(data, key))) return null;
  if (data.version !== 1 || typeof data.muted !== "boolean" || !volume(data.sfxVolume) || !volume(data.ambienceVolume)) return null;
  return { version: 1, muted: data.muted, sfxVolume: data.sfxVolume, ambienceVolume: data.ambienceVolume };
}
export function parseAudioPreferences(raw: string | null): AudioPreferences | null {
  if (raw === null || raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) return null;
  try { return validateAudioPreferences(JSON.parse(raw)); } catch { return null; }
}
export function loadAudioPreferences(storage?: AudioPreferenceStorage): AudioPreferences {
  try { return parseAudioPreferences(storage?.getItem(AUDIO_PREFERENCES_KEY) ?? null) ?? { ...DEFAULT_AUDIO_PREFERENCES }; }
  catch { return { ...DEFAULT_AUDIO_PREFERENCES }; }
}
export function saveAudioPreferences(storage: AudioPreferenceStorage | undefined, preferences: AudioPreferences): boolean {
  try {
    const valid = validateAudioPreferences(preferences);
    if (!storage || !valid) return false;
    storage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(valid));
    return true;
  } catch { return false; }
}
