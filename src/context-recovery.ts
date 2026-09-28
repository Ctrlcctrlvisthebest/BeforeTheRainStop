export type ContextStatus = "lost" | "restored" | "failed";

/** Observe the browser's recovery; never request a new context in a retry loop.
 * Register after WebGLRenderer so its native restoration runs first. */
export class ContextRecovery {
  lost = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  constructor(
    private readonly canvas: EventTarget,
    private readonly report: (status: ContextStatus) => void,
    private readonly timeoutMs = 30_000,
  ) {
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }
  private onLost = (event: Event) => {
    event.preventDefault();
    if (this.disposed || this.lost) return;
    this.lost = true;
    this.report("lost");
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.disposed && this.lost) this.report("failed");
    }, this.timeoutMs);
  };
  private onRestored = () => {
    if (this.disposed || !this.lost) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.lost = false;
    this.report("restored");
  };
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
  }
}
