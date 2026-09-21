import { SERVICE } from "./api";
import { stored, save } from "./storage";
import {
  validPlayerToken,
  RANKING_VERSION,
  type LeaderboardData,
} from "./leaderboard";
import type { Replay } from "./replay";
import { LEVELS, isMode } from "./game";

export function playerIdentity() {
  const saved = stored<unknown>("local", "rain-player-token-v1");
  if (validPlayerToken(saved)) return saved;
  const token = crypto.randomUUID();
  save("local", "rain-player-token-v1", token);
  return token;
}
export interface SoloScore {
  level: number;
  name: string;
  playerToken: string;
  replay: Replay;
}
export class RankingError extends Error {
  constructor(public status: number) {
    super("排行榜暂时不可用");
  }
}

function validLeaderboardData(value: unknown): value is LeaderboardData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.level === "number" &&
    Number.isInteger(data.level) &&
    data.level >= 0 &&
    data.level < LEVELS.length &&
    isMode(data.mode) &&
    Array.isArray(data.entries) &&
    data.entries.every((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return false;
      const row = entry as Record<string, unknown>;
      return (
        typeof row.id === "string" &&
        Array.isArray(row.names) &&
        row.names.every((name: unknown) => typeof name === "string") &&
        typeof row.timeMs === "number" &&
        Number.isSafeInteger(row.timeMs) &&
        row.timeMs > 0 &&
        typeof row.achievedAt === "number" &&
        Number.isSafeInteger(row.achievedAt) &&
        row.achievedAt >= 0
      );
    })
  );
}

export async function rankingRequest(
  path: string,
  body?: SoloScore,
  signal?: AbortSignal,
): Promise<LeaderboardData> {
  const response = await fetch(`${SERVICE}/api/leaderboard${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body
      ? JSON.stringify({ ...body, version: RANKING_VERSION })
      : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new RankingError(response.status);
  const data: unknown = await response.json();
  // Do not let invalid network data reach the leaderboard's array rendering.
  if (!validLeaderboardData(data)) throw new Error("排行榜返回的数据无效");
  return data;
}
