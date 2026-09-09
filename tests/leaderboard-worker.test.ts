import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { LEVELS, newGame, type Mode } from "../src/game";
import { type Room } from "../src/room";
import { RANKING_VERSION } from "../src/leaderboard";
import { ReplayRecorder } from "../src/replay";
import { completeLevel } from "./journey";
import { NAME_REJECTED } from "../src/player-name";

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
    version: RANKING_VERSION,
    stars: LEVELS[0].stars.map((_, id) => id),
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
  const game = completeLevel(12, undefined, (g, input) =>
    recorder.record(g, input),
  );
  const body = {
    level: 12,
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
  assert.equal(board.submitSolo({ ...body, version: 1 }, "A").status, 409);
  assert.deepEqual(board.top(), []);
  // A rejected name wins over an invalid replay and never reaches score storage.
  assert.deepEqual(
    board.submitSolo({ ...body, name: "習 近平", replay: null }, "A"),
    {
      status: 422,
      data: { error: NAME_REJECTED },
    },
  );
  for (const name of ["习近平", "Ｘｉ－Ｊｉｎｐｉｎｇ", "习\u200b近\u2060平"])
    assert.equal(board.submitSolo({ ...body, name }, "A").status, 422);
  assert.deepEqual(board.top(), []);
  assert.equal(board.submitSolo(body, "A").status, 200);
  assert.equal(board.top()[0].timeMs, Math.round(game.time * 1000));
  assert.deepEqual(board.top()[0].names, ["Rain"]);
  ctx.db.close();
});

test("historical leaderboard names are masked on read and queued team scores retain safe teammates", () => {
  const ctx = context(),
    board = new RainLeaderboard(ctx, {});
  ctx.db
    .prepare("INSERT INTO scores VALUES(?,?,?,?,?)")
    .run("old-player", "old-clear", JSON.stringify(["習近平"]), 5000, 100);
  assert.deepEqual(board.top(), [
    { id: "old-clear", names: ["旅人"], timeMs: 5000, achievedAt: 100 },
  ]);
  board.submitVerified({
    version: RANKING_VERSION,
    stars: LEVELS[0].stars.map((_, id) => id),
    participant: "old-team",
    id: "queued-clear",
    level: 0,
    mode: 3,
    names: ["习\u200b近平", "风铃", "Paper"],
    timeMs: 4000,
    achievedAt: 200,
  });
  assert.deepEqual(board.top()[0].names, ["旅人", "风铃", "Paper"]);
  assert.deepEqual(
    JSON.parse(
      ctx.db
        .prepare("SELECT names FROM scores WHERE participant=?")
        .get("old-team")!.names as string,
    ),
    ["旅人", "风铃", "Paper"],
  );
  assert.deepEqual(new RainLeaderboard(ctx, {}).top(), board.top());
  ctx.db.close();
});

test("actual room RPC rejects names without saving rooms or consuming guest seats", async () => {
  const ctx = context(),
    object = new RainRoom(ctx, {});
  await ctx.ready();
  const rejected = await object.operate("create", "ABCDEFGH", "", {
    capacity: 2,
    level: 0,
    name: "習近平",
  });
  assert.deepEqual(rejected, { status: 422, data: { error: NAME_REJECTED } });
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM room").get()!.n, 0);
  const created = await object.operate("create", "ABCDEFGH", "", {
    capacity: 2,
    level: 0,
    name: "风铃",
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await object.operate("join", "ABCDEFGH", "", { name: "习 近平" })).status,
    422,
  );
  const state = await object.operate(
    "state",
    "ABCDEFGH",
    created.data.token,
    {},
  );
  assert.equal(state.data.room.players.length, 1);
  assert.equal(state.data.room.revision, created.data.room.revision);
  const joined = await object.operate("join", "ABCDEFGH", "", { name: "纸鹤" });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.slot, 1);
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
    room.players[0].name = "習近平"; // A legacy room must not poison the retry queue.
    room.phase = "game";
    room.game = newGame(mode, 0, "finished");
    room.game.status = "won";
    room.game.stars = LEVELS[0].stars.map((_, id) => id);
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
    assert.equal(board.top()[0].names[0], "旅人");
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

test("a valid clear without all stars cannot claim a ranked score", () => {
  const ctx = context(),
    board = new RainLeaderboard(ctx, {}),
    recorder = new ReplayRecorder();
  const game = completeLevel(0, undefined, (g, input) =>
    recorder.record(g, input),
  );
  assert.ok(game.stars.length < LEVELS[0].stars.length);
  const result = board.submitSolo(
    {
      level: 0,
      version: RANKING_VERSION,
      name: "Paper",
      stars: LEVELS[0].stars.map((_, id) => id),
      replay: recorder.snapshot(game),
    },
    "A",
  );
  assert.equal(result.status, 400);
  assert.deepEqual(board.top(), []);
  ctx.db.close();
});

for (const mode of [2, 3, 6] as Mode[])
  test(`${mode} players: missing stars never enter the upload queue`, async () => {
    const ctx = context(),
      object = new RainRoom(ctx, {});
    await ctx.ready();
    await object.operate("create", "ABCDEFGH", "", {
      capacity: mode,
      level: 0,
      name: "Paper",
    });
    const room = object.room as Room;
    room.game = newGame(mode, 0, "incomplete");
    room.game.status = "won";
    room.game.time = 10;
    object.enqueueScore(room);
    assert.equal(room.rankingStatus, undefined);
    assert.equal(
      ctx.db.prepare("SELECT COUNT(*) n FROM score_outbox").get()!.n,
      0,
    );
    ctx.db.close();
  });

test("old map sessions return to lobby and old queued scores stay out of new boards", async () => {
  const ctx = context(),
    object = new RainRoom(ctx, {});
  await ctx.ready();
  await object.operate("create", "ABCDEFGH", "", {
    capacity: 2,
    level: 0,
    name: "Paper",
  });
  const room = object.room as Room;
  room.game = newGame(2, 0, "old");
  room.game.rulesVersion = 2;
  room.phase = "game";
  object.save(room);
  ctx.db
    .prepare("INSERT INTO score_outbox VALUES(?,?)")
    .run("old", JSON.stringify({ id: "old", version: 2 }));
  const reloaded = new RainRoom(ctx, {});
  await ctx.ready();
  assert.equal(reloaded.room.phase, "lobby");
  assert.equal(reloaded.room.game, null);
  assert.equal(reloaded.room.players.length, 1);
  await reloaded.alarm();
  assert.equal(
    ctx.db.prepare("SELECT COUNT(*) n FROM score_outbox").get()!.n,
    0,
  );
  assert.equal(
    ctx.db.prepare("SELECT COUNT(*) n FROM legacy_score_outbox").get()!.n,
    1,
  );
  ctx.db.close();
});
