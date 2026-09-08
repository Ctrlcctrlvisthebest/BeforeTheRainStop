import { SERVICE } from "./api";
import { stored, save } from "./storage";
import {
  validPlayerToken,
  RANKING_VERSION,
  type LeaderboardData,
} from "./leaderboard";
import type { Replay } from "./replay";

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
  return response.json();
}
