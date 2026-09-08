import { LEVELS, isMode, type Mode } from "./game";

// Bump when chapter layouts or physics change in ways that affect race times.
export const RANKING_VERSION = 1;
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
  return `v${RANKING_VERSION}:${mode}:${LEVELS[level].name}`;
}
