import type { ContextStatus } from "./context-recovery";

/** Preview simulation is suspended independently from a user's pause choice.
 * Loading, loss and tab restoration discard elapsed time rather than catching
 * up an invisible run; restoring the GPU never overrides a manual pause. */
export class PreviewClock {
  ready = false;
  lost = false;
  paused = false;
  private last = 0;
  private accumulator = 0;
  sync(now: number) {
    this.last = now;
    this.accumulator = 0;
  }
  reset(now: number) {
    this.ready = this.lost = false;
    this.sync(now);
  }
  prepared(now: number) {
    if (this.lost) return;
    this.ready = true;
    this.sync(now);
  }
  context(status: ContextStatus, now: number) {
    this.lost = status !== "restored";
    this.ready = false;
    this.sync(now);
  }
  pause(value: boolean, now: number) {
    this.paused = value;
    this.sync(now);
  }
  active(hidden = false) {
    return this.ready && !this.lost && !this.paused && !hidden;
  }
  advance(now: number, hidden: boolean, playing: boolean, step: () => void) {
    if (!this.ready || this.lost || hidden) {
      this.sync(now);
      return 0;
    }
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    if (this.paused || !playing) this.accumulator = 0;
    else {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 60) {
        step();
        this.accumulator -= 1 / 60;
      }
    }
    return dt;
  }
}
