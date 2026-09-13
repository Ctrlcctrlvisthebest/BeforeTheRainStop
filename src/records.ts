import { rankedClear } from "./score-rules";
import { CAMPAIGN_VERSION } from "./campaign-version";
import { LEVELS, MODES, isMode, type Game, type Mode } from "./game";
import { save, stored } from "./storage";

export const RECORDS_KEY = `rain-best-times-all-stars-v${CAMPAIGN_VERSION}`;
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
  let value = stored<unknown>("local", RECORDS_KEY);
  // The 14 untouched chapters keep their existing bests. Remade chapters get
  // new records; keep the original v3 file intact as the historical copy.
  if (value == null && CAMPAIGN_VERSION === 4) {
    const legacy = stored<unknown>("local", "rain-best-times-all-stars-v3");
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      const unchanged = [
        ...chapterNames.slice(0, 9),
        ...chapterNames.slice(12, 17),
      ];
      value = Object.fromEntries(
        MODES.flatMap((mode) =>
          unchanged.map((name) => {
            const key = `${mode}:${name}`;
            return [key, (legacy as Record<string, unknown>)[key]];
          }),
        ),
      );
    }
  }
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

/** Keep stored millisecond precision; round the display to tenths of a second. */
export function formatTime(ms: number) {
  if (!Number.isSafeInteger(ms) || ms < 0) return "—";
  const tenths = Math.round(ms / 100);
  const minutes = String(Math.floor(tenths / 600)).padStart(2, "0");
  const seconds = String(Math.floor(tenths / 10) % 60).padStart(2, "0");
  return `${minutes}:${seconds}.${tenths % 10}`;
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
    if (!rankedClear(game)) return null;
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
