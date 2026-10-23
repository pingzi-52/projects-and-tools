export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
