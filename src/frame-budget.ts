/** Cap GPU work on high-refresh displays without changing the 60 Hz physics. */
export class FrameBudget {
  private next = -Infinity;
  ready(now: number, fps = 60) {
    const interval = 1000 / fps;
    if (now < this.next - 0.75) return false;
    // Keep the cadence aligned on 90/144 Hz screens; reset after a hidden tab.
    this.next =
      now - this.next > interval ? now + interval : this.next + interval;
    return true;
  }
}
