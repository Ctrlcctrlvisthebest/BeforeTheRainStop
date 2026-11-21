import { CHAPTER_STORAGE_SUFFIXES } from "./chapter-storage";
import {
  CAMPAIGN_VERSION,
  UNCHANGED_LEVELS_V6,
  REBUILT_LEVELS_V8,
  REBUILT_LEVELS_V9,
} from "./campaign-version";
import { LEVELS, isMode, type Mode } from "./game";
import { isRainDifficulty, type RainDifficulty } from "./rain-difficulty";

// Replay protocol: old clients must refresh after gameplay rules change.
export const RANKING_VERSION = CAMPAIGN_VERSION;
// Leave legacy boards intact; only full-star runs on the rebuilt maps compete.
const BOARD_STORAGE_VERSION = 3;
export interface RankingEntry {
  id: string;
  names: string[];
  timeMs: number;
  achievedAt: number;
}
export interface LeaderboardData {
  level: number;
  mode: Mode;
  rainDifficulty: RainDifficulty;
  entries: RankingEntry[];
}
export const validPlayerToken = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function boardName(
  level: number,
  mode: Mode,
  rainDifficulty: RainDifficulty = "normal",
) {
  if (!Number.isInteger(level) || !LEVELS[level] || !isMode(mode))
    throw new Error("关卡或人数无效");
  if (!isRainDifficulty(rainDifficulty)) throw new Error("雨速无效");
  const name = `v${REBUILT_LEVELS_V9.includes(level) ? 5 : REBUILT_LEVELS_V8.includes(level) ? 4 : UNCHANGED_LEVELS_V6.includes(level) ? 2 : BOARD_STORAGE_VERSION}:${mode}:${CHAPTER_STORAGE_SUFFIXES[level]}`;
  return rainDifficulty === "normal" ? name : `${name}:rain-${rainDifficulty}`;
}
