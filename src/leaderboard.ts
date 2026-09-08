import { LEVELS, isMode, type Mode } from "./game";

// Replay protocol: old clients must refresh after gameplay rules change.
export const RANKING_VERSION = 2;
// These rules only relax route restrictions; previous achievements stay valid.
// Keep their existing boards and allow faster new routes to replace old times.
const BOARD_STORAGE_VERSION = 1;
export interface RankingEntry {
  id: string;
  names: string[];
  timeMs: number;
  achievedAt: number;
}
export interface LeaderboardData {
  level: number;
  mode: Mode;
  entries: RankingEntry[];
}
export const validPlayerToken = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function boardName(level: number, mode: Mode) {
  if (!Number.isInteger(level) || !LEVELS[level] || !isMode(mode))
    throw new Error("关卡或人数无效");
  return `v${BOARD_STORAGE_VERSION}:${mode}:${LEVELS[level].name}`;
}
