import { rankedClear, hasAllStars } from "../src/score-rules";
import { DurableObject } from "cloudflare:workers";
import {
  boardName,
  RANKING_VERSION,
  type RankingEntry,
} from "../src/leaderboard";
import { verifyReplay } from "../src/replay";
import {
  requirePlayerName,
  publicPlayerName,
  NamePolicyError,
} from "./name-policy";
import type { Game, Mode } from "../src/game";

export interface VerifiedScore extends RankingEntry {
  version: number;
  stars: number[];
  level: number;
  mode: Mode;
  participant: string;
}
export class RainLeaderboard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      participant TEXT PRIMARY KEY, id TEXT NOT NULL, names TEXT NOT NULL,
      time_ms INTEGER NOT NULL CHECK(time_ms > 0), achieved_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS fastest ON scores(time_ms, achieved_at, id)`);
  }
  top(): RankingEntry[] {
    return this.ctx.storage.sql
      .exec<{
        id: string;
        names: string;
        time_ms: number;
        achieved_at: number;
      }>(
        "SELECT id,names,time_ms,achieved_at FROM scores ORDER BY time_ms,achieved_at,id LIMIT 3",
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        names: (JSON.parse(row.names) as string[]).map(publicPlayerName),
        timeMs: row.time_ms,
        achievedAt: row.achieved_at,
      }));
  }
  submitVerified(score: VerifiedScore) {
    boardName(score.level, score.mode);
    if (
      score.version !== RANKING_VERSION ||
      !Array.isArray(score.stars) ||
      !hasAllStars(score.level, score.stars) ||
      !score.participant ||
      score.names.length !== score.mode ||
      !Number.isSafeInteger(score.timeMs) ||
      score.timeMs <= 0
    )
      throw new Error("成绩无效");
    this.ctx.storage.sql.exec(
      `INSERT INTO scores(participant,id,names,time_ms,achieved_at) VALUES(?,?,?,?,?)
      ON CONFLICT(participant) DO UPDATE SET id=excluded.id,names=excluded.names,time_ms=excluded.time_ms,achieved_at=excluded.achieved_at
      WHERE excluded.time_ms < scores.time_ms`,
      score.participant,
      score.id,
      JSON.stringify(score.names.map(publicPlayerName)),
      score.timeMs,
      score.achievedAt,
    );
    return this.top();
  }
  submitSolo(body: Record<string, unknown>, participant: string) {
    let game: Game;
    let name: string;
    try {
      if (body.version !== RANKING_VERSION)
        return { status: 409, data: { error: "玩法已更新，请刷新后重新挑战" } };
      if (
        typeof body.level !== "number" ||
        (body.mode !== undefined && body.mode !== 1)
      )
        throw new Error("关卡或人数无效");
      boardName(body.level, 1);
      name = requirePlayerName(body.name);
      game = verifyReplay(body.level, body.replay);
      if (!rankedClear(game)) throw new Error("收齐全部星星的通关才计入记录");
    } catch (error) {
      return {
        status: error instanceof NamePolicyError ? error.status : 400,
        data: { error: error instanceof Error ? error.message : "成绩无效" },
      };
    }
    const entries = this.submitVerified({
      version: RANKING_VERSION,
      stars: [...game.stars],
      id: crypto.randomUUID(),
      level: game.level,
      mode: 1,
      participant: `1:${participant}`,
      names: [name],
      timeMs: Math.round(game.time * 1000),
      achievedAt: Date.now(),
    });
    return { status: 200, data: { level: game.level, mode: 1, entries } };
  }
}
