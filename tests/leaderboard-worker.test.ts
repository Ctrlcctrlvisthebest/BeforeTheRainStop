import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { newGame, type Mode } from "../src/game";
import { type Room } from "../src/room";
import { RANKING_VERSION } from "../src/leaderboard";
import { ReplayRecorder } from "../src/replay";
import { completeLevel } from "./journey";

// Exercise the actual Worker classes and real SQLite statements. Only the
// Cloudflare lifecycle is replaced; this harness is never in the shipped bundle.
const bundle = await build({
  entryPoints: ["server/worker.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "test-durable-object-runtime",
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "runtime",
          namespace: "test-runtime",
        }));
        b.onLoad({ filter: /.*/, namespace: "test-runtime" }, () => ({
          contents:
            "export class DurableObject { constructor(ctx,env) { this.ctx=ctx; this.env=env; } }",
        }));
      },
    },
  ],
});
const { RainLeaderboard, RainRoom } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

function context(db = new DatabaseSync(":memory:")) {
  let alarm: number | null = null,
    ready: Promise<unknown> = Promise.resolve();
  const pending: Promise<unknown>[] = [];
  const storage = {
    sql: {
      exec(query: string, ...bindings: (string | number)[]) {
        if (query.includes(";")) {
          db.exec(query);
          return { toArray: () => [] };
        }
        const statement = db.prepare(query);
        if (/^SELECT/.test(query))
          return { toArray: () => statement.all(...bindings) };
        statement.run(...bindings);
        return { toArray: () => [] };
      },
    },
    getAlarm: async () => alarm,
    setAlarm: async (time: number) => {
      alarm = time;
    },
    deleteAll: async () => {
      db.exec("DELETE FROM room; DELETE FROM score_outbox;");
    },
  };
  return {
    storage,
    db,
    getWebSockets: () => [],
    blockConcurrencyWhile(fn: () => Promise<unknown>) {
      ready = fn();
    },
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
    ready: () => ready,
    drain: async () => {
      while (pending.length) await Promise.all(pending.splice(0));
    },
  };
}

test("SQLite keeps the global fastest three; faster replacements, ties and persistence", () => {
  const ctx = context(),
    board = new RainLeaderboard(ctx, {});
  const score = (participant: string, timeMs: number, achievedAt = 100) => ({
    participant,
    timeMs,
    achievedAt,
    id: participant + timeMs,
    level: 0,
    mode: 1,
    names: [participant],
  });
  board.submitVerified(score("A", 4000));
  board.submitVerified(score("B", 3000));
  board.submitVerified(score("C", 2000));
  board.submitVerified(score("D", 5000));
  assert.deepEqual(
    board.top().map((s: any) => s.names[0]),
    ["C", "B", "A"],
  );
  board.submitVerified(score("D", 1000));
  board.submitVerified(score("D", 6000));
  assert.deepEqual(
    board.top().map((s: any) => s.timeMs),
    [1000, 2000, 3000],
  );
  board.submitVerified(score("E", 1000, 200));
  assert.deepEqual(
    board.top().map((s: any) => s.names[0]),
    ["D", "E", "C"],
  );
  assert.deepEqual(new RainLeaderboard(ctx, {}).top(), board.top());
  assert.ok(board.top().every((s: any) => !("participant" in s)));
  ctx.db.close();
});

test("solo RPC derives time from the replay, ignores a claimed time, sanitizes names and rejects invalid runs", () => {
  const ctx = context(),
    board = new RainLeaderboard(ctx, {}),
    recorder = new ReplayRecorder();
  const game = completeLevel(0, undefined, (g, input) =>
    recorder.record(g, input),
  );
  const body = {
    level: 0,
    version: RANKING_VERSION,
    replay: recorder.snapshot(game),
    name: "<Rain>\u0000",
    timeMs: 1,
  };
  assert.equal(
    board.submitSolo({ ...body, replay: [[1, 1]] }, "A").status,
    400,
  );
  assert.equal(board.submitSolo({ ...body, mode: 2 }, "A").status, 400);
  assert.equal(board.submitSolo({ ...body, version: -1 }, "A").status, 409);
  assert.deepEqual(board.top(), []);
  assert.equal(board.submitSolo(body, "A").status, 200);
  assert.equal(board.top()[0].timeMs, Math.round(game.time * 1000));
  assert.deepEqual(board.top()[0].names, ["Rain"]);
  ctx.db.close();
});

for (const mode of [2, 3, 6] as Mode[])
  test(`${mode} players: failed team upload survives object reload and a new run`, async () => {
    const ctx = context(),
      boardCtx = context(),
      board = new RainLeaderboard(boardCtx, {});
    let unavailable = true;
    const env = {
      LEADERBOARDS: {
        getByName: () => ({
          submitVerified: async (score: any) => {
            if (unavailable) throw new Error("temporary outage");
            return board.submitVerified(score);
          },
        }),
      },
    };
    const roomObject = new RainRoom(ctx, env);
    await ctx.ready();
    const created = await roomObject.operate("create", "ABCDEFGH", "", {
      capacity: mode,
      level: 0,
      name: "host",
    });
    for (let i = 1; i < mode; i++)
      await roomObject.operate("join", "ABCDEFGH", "", { name: `guest${i}` });
    // A finished authoritative state isolates the persistence lifecycle from physics.
    const room = roomObject.room as Room;
    room.phase = "game";
    room.game = newGame(mode, 0, "finished");
    room.game.status = "won";
    room.game.time = 12.345;
    roomObject.enqueueScore(room);
    await ctx.drain();
    assert.equal(room.rankingStatus, "retry");
    assert.equal(
      ctx.db.prepare("SELECT COUNT(*) n FROM score_outbox").get()!.n,
      1,
    );
    room.game = newGame(mode, 0, "next-run");
    delete room.rankingStatus;
    roomObject.save(room);
    unavailable = false;
    const reloaded = new RainRoom(ctx, env);
    await ctx.ready();
    await reloaded.alarm();
    assert.equal(board.top().length, 1);
    assert.equal(board.top()[0].timeMs, 12345);
    assert.equal(board.top()[0].names.length, mode);
    assert.equal(
      ctx.db.prepare("SELECT COUNT(*) n FROM score_outbox").get()!.n,
      0,
    );
    const state = await reloaded.operate(
      "state",
      "ABCDEFGH",
      created.data.token,
      {},
    );
    assert.equal(state.data.room.game.id, "next-run");
    assert.equal(state.data.room.rankingStatus, undefined);
    await reloaded.alarm();
    assert.equal(board.top().length, 1);
    ctx.db.close();
    boardCtx.db.close();
  });
