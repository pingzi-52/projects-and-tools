/** A short-lived message measured only in active play time. */
export class ActiveNotice {
  private message = "";
  private remaining = 0;
  private wasPaused = false;

  show(message: string, duration = 3500): void {
    this.message = message;
    this.remaining = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    if (!message || this.remaining === 0) this.clear();
  }

  update(delta: number, paused: boolean): string {
    if (paused) {
      this.wasPaused = true;
      return "";
    }
    const elapsed = this.wasPaused || !Number.isFinite(delta) ? 0 : Math.max(0, Math.min(delta, 100));
    this.wasPaused = false;
    this.remaining = Math.max(0, this.remaining - elapsed);
    if (this.remaining === 0) this.message = "";
    return this.message;
  }

  clear(): void {
    this.message = "";
    this.remaining = 0;
    this.wasPaused = false;
  }
}
