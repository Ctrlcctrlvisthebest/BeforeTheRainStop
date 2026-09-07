import { LEVELS, MODES, isMode, type Game, type Mode } from "./game";
import { save, stored } from "./storage";

export const RECORDS_KEY = "rain-best-times-v1";
export type BestTimes = Record<string, number>;
// Names identify the built-in chapters independently of their menu position or UI language.
const chapterNames = LEVELS.map((level) => level.name);
function recordKey(level: number, mode: Mode) {
  return Number.isInteger(level) && chapterNames[level] && isMode(mode)
    ? `${mode}:${chapterNames[level]}`
    : null;
}
const validTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function loadBestTimes(): BestTimes {
  const value = stored<unknown>("local", RECORDS_KEY);
  const times: BestTimes = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return times;
  for (const mode of MODES)
    for (const name of chapterNames) {
      const key = `${mode}:${name}`;
      const time = (value as Record<string, unknown>)[key];
      if (validTime(time)) times[key] = time;
    }
  return times;
}

export function bestTimeFor(times: BestTimes, level: number, mode: Mode) {
  const key = recordKey(level, mode);
  return key ? times[key] : undefined;
}

/** Milliseconds are compared and displayed at the same precision. */
export function formatTime(ms: number) {
  if (!Number.isSafeInteger(ms) || ms < 0) return "—";
  const minutes = String(Math.floor(ms / 60000)).padStart(2, "0");
  const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${minutes}:${seconds}.${String(ms % 1000).padStart(3, "0")}`;
}

export interface Completion {
  gameId: string;
  level: number;
  mode: Mode;
  timeMs: number;
  bestMs: number;
  previousMs: number | undefined;
  improved: boolean;
  persisted: boolean;
}

export class LocalRecords {
  times = loadBestTimes();
  private last: Completion | null = null;

  /** Only call with the actual simulation/server state, never a predicted frame. */
  record(game: Game): Completion | null {
    if (game.status !== "won") return null;
    const key = recordKey(game.level, game.mode);
    const timeMs = Math.round(game.time * 1000);
    if (!key || !validTime(timeMs)) return null;
    if (
      this.last?.gameId === game.id &&
      this.last.level === game.level &&
      this.last.mode === game.mode
    )
      return null;

    // Re-read at completion so a stale tab cannot overwrite a newer, faster best.
    const disk = loadBestTimes();
    const times = { ...disk };
    for (const [key, time] of Object.entries(this.times))
      times[key] = Math.min(time, times[key] ?? Infinity);
    const previousMs = times[key];
    const improved = previousMs === undefined || timeMs < previousMs;
    const bestMs = improved ? timeMs : previousMs;
    times[key] = bestMs;
    const persisted = disk[key] === bestMs || save("local", RECORDS_KEY, times);
    this.times = times;
    this.last = {
      gameId: game.id,
      level: game.level,
      mode: game.mode,
      timeMs,
      bestMs,
      previousMs,
      improved,
      persisted,
    };
    return this.last;
  }
}
