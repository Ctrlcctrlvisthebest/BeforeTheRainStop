export type QualityMode = "auto" | "standard" | "economy";
export type QualityTier = Exclude<QualityMode, "auto">;

export function qualityMode(value: unknown): QualityMode {
  return value === "standard" || value === "economy" ? value : "auto";
}

/** Keep the original artwork and simulation. Only change rendering resolution,
 * shadow resolution and the density of decorative rain. */
export function qualitySettings(
  tier: QualityTier,
  deviceRatio: number,
  coarsePointer: boolean,
) {
  const ratio =
    Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  return tier === "economy"
    ? { pixelRatio: Math.min(ratio, 1), shadowSize: 512, rainDrops: 320 }
    : {
        pixelRatio: Math.min(ratio, coarsePointer ? 1.5 : 2),
        shadowSize: coarsePointer ? 1024 : 2048,
        rainDrops: 560,
      };
}

/** Bounded observation window, with a warm-up after loads and interruptions.
 * Auto may step down once per selection; it never oscillates back up mid-jump.
 * Call only for the displayed 60 Hz game loop, not a throttled help screen. */
export class AdaptiveQuality {
  mode: QualityMode;
  tier: QualityTier;
  private last: number | undefined;
  private warmup = 0;
  private duration = 0;
  private slowDuration = 0;
  private frames = 0;

  constructor(mode: QualityMode = "auto") {
    this.mode = qualityMode(mode);
    this.tier = this.mode === "economy" ? "economy" : "standard";
  }

  select(mode: QualityMode) {
    const next = qualityMode(mode);
    if (next === this.mode) return false;
    this.mode = next;
    const tier = next === "economy" ? "economy" : "standard";
    const changed = this.tier !== tier;
    this.tier = tier;
    this.resetObservation();
    return changed;
  }

  resetObservation() {
    this.last = undefined;
    this.warmup = this.duration = this.slowDuration = this.frames = 0;
  }

  observe(now: number, active = true) {
    if (!active || !Number.isFinite(now)) {
      this.resetObservation();
      return false;
    }
    if (this.mode !== "auto" || this.tier === "economy") return false;
    const elapsed = this.last === undefined ? 0 : now - this.last;
    this.last = now;
    // Tab restoration or a single long compile is not sustained GPU pressure.
    if (elapsed <= 0 || elapsed > 1000) {
      this.warmup = this.duration = this.slowDuration = this.frames = 0;
      return false;
    }
    if (this.warmup < 3000) {
      this.warmup += elapsed;
      return false;
    }
    this.duration += elapsed;
    this.frames++;
    if (elapsed > 25) this.slowDuration += elapsed;
    if (this.duration < 8000 || this.frames < 60) return false;
    const shouldReduce = this.slowDuration / this.duration >= 0.7;
    this.duration = this.slowDuration = this.frames = 0;
    if (!shouldReduce) return false;
    this.tier = "economy";
    return true;
  }
}
