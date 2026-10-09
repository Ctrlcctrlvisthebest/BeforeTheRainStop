import test from "node:test";
import { readFileSync } from "node:fs";
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
const {
  default: worker,
  RainLeaderboard,
  RainRoom,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + "\n//# sourceURL=worker-under-test.js").toString("base64")}`
);

function context(
  db = new DatabaseSync(":memory:"),
  sockets: ReturnType<typeof roomSocket>[] = [],
) {
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
    getWebSockets: () => sockets,
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
function roomSocket(slot: number, token: string) {
  let attachment = { slot, token, seq: -1, window: Date.now(), count: 0 };
  return {
    readyState: 1,
    messages: [] as string[],
    closeCode: null as number | null,
    deserializeAttachment: () => structuredClone(attachment),
    serializeAttachment: (value: typeof attachment) => {
      attachment = structuredClone(value);
    },
    send(data: string) {
      this.messages.push(data);
    },
    close(code: number) {
      this.closeCode = code;
      this.readyState = 3;
    },
  };
}

async function recoveryRoom(env = {}) {
  const sockets: ReturnType<typeof roomSocket>[] = [];
  const ctx = context(undefined, sockets);
  const object = new RainRoom(ctx, env);
  await ctx.ready();
  const created = await object.operate("create", "ABCDEFGH", "", {
    capacity: 3,
    level: 15,
    name: "host",
  });
  const first = await object.operate("join", "ABCDEFGH", "", { name: "first" });
  const second = await object.operate("join", "ABCDEFGH", "", {
    name: "second",
  });
  const tokens = [created.data.token, first.data.token, second.data.token];
  tokens.forEach((token, slot) => sockets.push(roomSocket(slot, token)));
  const room = object.room as Room;
  room.players.forEach((p) => (p.online = true));
  room.phase = "game";
  room.game = newGame(3, 15, "recovery-game");
  room.game.time = 12;
  object.save(room);
  return { ctx, object, sockets, tokens };
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

test("verified score metadata is validated before SQLite can persist malformed ranking entries", () => {
  const ctx = context();
  const board = new RainLeaderboard(ctx, {});
  const score = {
    version: RANKING_VERSION,
    stars: LEVELS[0].stars.map((_, id) => id),
    participant: "player",
    timeMs: 1000,
    achievedAt: 100,
    id: "run",
    level: 0,
    mode: 1,
    names: ["Paper"],
  };
  for (const invalid of [
    { achievedAt: "yesterday" },
    { achievedAt: -1 },
    { achievedAt: 1.5 },
    { achievedAt: Number.NaN },
    { achievedAt: Number.POSITIVE_INFINITY },
    { id: 123 },
    { id: "" },
    { participant: 123 },
    { names: null },
    { names: { length: 1 } },
    { names: [123] },
  ]) {
    assert.throws(
      () => board.submitVerified({ ...score, ...invalid }),
      /成绩无效/,
    );
    assert.deepEqual(board.top(), []);
  }
  assert.equal(board.submitVerified(score).length, 1);
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
  const game = completeLevel(2, undefined, (g, input) =>
    recorder.record(g, input),
  );
  assert.ok(game.stars.length < LEVELS[2].stars.length);
  const result = board.submitSolo(
    {
      level: 2,
      version: RANKING_VERSION,
      name: "Paper",
      stars: LEVELS[2].stars.map((_, id) => id),
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

test("itch CDN origins pass the real Worker boundary; lookalikes and unknown origins fail", async () => {
  const config = readFileSync(
    new URL("../wrangler.github.jsonc", import.meta.url),
    "utf8",
  );
  const ALLOWED_ORIGINS = config.match(/"ALLOWED_ORIGINS": "([^"]+)"/)![1];
  for (const origin of [
    "https://html-classic.itch.zone",
    "https://html.itch.zone",
    "https://ctrlcctrlvisthebest.github.io",
    "https://www.bilibilitoy.com",
  ]) {
    const response = await worker.fetch(
      new Request("https://game.example/api/rooms", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,authorization",
        },
      }),
      { ALLOWED_ORIGINS },
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    const health = await worker.fetch(
      new Request("https://game.example/api/health", {
        headers: { Origin: origin },
      }),
      { ALLOWED_ORIGINS },
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const denied = await worker.fetch(
      new Request("https://game.example/api/health", {
        headers: { Origin: `${origin}.attacker.example` },
      }),
      { ALLOWED_ORIGINS },
    );
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
  }
});

test("HTTP JSON and Bearer parsing accepts case-insensitive standards and rejects lookalike media types", async () => {
  const calls: { kind: string; token: string }[] = [];
  const limiter = { limit: async () => ({ success: true }) };
  const env = {
    ALLOWED_ORIGINS: "",
    ROOM_CREATION_LIMIT: limiter,
    ROOM_REQUEST_LIMIT: limiter,
    ROOMS: {
      getByName: () => ({
        operate: async (kind: string, _code: string, token: string) => {
          calls.push({ kind, token });
          return { status: 200, data: {} };
        },
      }),
    },
  };
  for (const contentType of [
    "application/json",
    "Application/JSON; charset=utf-8",
  ]) {
    const response = await worker.fetch(
      new Request("https://game.example/api/rooms", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: "{}",
      }),
      env,
    );
    assert.equal(response.status, 200, contentType);
  }
  for (const contentType of [
    "application/jsonp",
    "text/plain; application/json",
  ]) {
    const response = await worker.fetch(
      new Request("https://game.example/api/rooms", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: "{}",
      }),
      env,
    );
    assert.equal(response.status, 400, contentType);
  }
  assert.equal(calls.length, 2);
  const token = "12345678-1234-1234-1234-123456789abc";
  for (const authorization of [
    `Bearer ${token}`,
    `bearer ${token}`,
    `BEARER  ${token}`,
  ]) {
    const response = await worker.fetch(
      new Request("https://game.example/api/rooms/ABCDEFGH", {
        headers: { Authorization: authorization },
      }),
      env,
    );
    assert.equal(response.status, 200, authorization);
    assert.deepEqual(calls.at(-1), { kind: "state", token });
  }
  for (const authorization of [
    token,
    `Bearer ${"-".repeat(36)}`,
    `Basic ${token}`,
  ]) {
    const response = await worker.fetch(
      new Request("https://game.example/api/rooms/ABCDEFGH", {
        headers: { Authorization: authorization },
      }),
      env,
    );
    assert.equal(response.status, 401, authorization);
  }
  assert.equal(calls.length, 5);
});

test("a rejected WebSocket backend promise uses the standard HTTP error boundary", async () => {
  const response = await worker.fetch(
    new Request("https://game.example/api/rooms/ABCDEFGH/ws", {
      headers: { Upgrade: "websocket" },
    }),
    {
      ALLOWED_ORIGINS: "",
      ROOM_REQUEST_LIMIT: { limit: async () => ({ success: true }) },
      ROOMS: {
        getByName: () => ({
          fetch: async () => {
            throw new Error("backend temporarily unavailable");
          },
        }),
      },
    },
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "房间服务暂时不可用，请稍后重试",
  });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("malformed, oversized, outdated and rate-limited HTTP requests never reach room storage", async () => {
  let calls = 0;
  let limited = false;
  const limiter = { limit: async () => ({ success: !limited }) };
  const env = {
    ALLOWED_ORIGINS: "",
    ROOM_CREATION_LIMIT: limiter,
    ROOM_REQUEST_LIMIT: limiter,
    ROOMS: {
      getByName: () => {
        calls++;
        throw new Error("invalid request reached room storage");
      },
    },
  };
  for (const [body, status] of [
    ["{", 400],
    ["null", 400],
    ["[]", 400],
    ['"name"', 400],
    ["", 400],
    [JSON.stringify({ name: "雨".repeat(2800) }), 413],
  ] as const) {
    const response = await worker.fetch(
      new Request("https://game.example/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      env,
    );
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, "string");
  }
  const outdated = await worker.fetch(
    new Request("https://game.example/api/rooms/ABCDEFGH/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer 12345678-1234-1234-1234-123456789abc",
      },
      body: JSON.stringify({ type: "start", rulesVersion: -1 }),
    }),
    env,
  );
  assert.equal(outdated.status, 409);
  limited = true;
  const rateLimited = await worker.fetch(
    new Request("https://game.example/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    env,
  );
  assert.equal(rateLimited.status, 429);
  assert.equal(calls, 0);
});

test("score retries preserve a room's earlier expiry alarm", async () => {
  const ctx = context();
  const object = new RainRoom(ctx, {
    LEADERBOARDS: {
      getByName: () => ({
        submitVerified: async () => {
          throw new Error("temporary outage");
        },
      }),
    },
  });
  await ctx.ready();
  await object.operate("create", "ABCDEFGH", "", {
    capacity: 2,
    level: 0,
    name: "Paper",
  });
  const room = object.room as Room;
  room.expiresAt = Date.now() + 10000;
  room.game = newGame(2, 0, "expiry-score");
  room.game.status = "won";
  room.game.stars = LEVELS[0].stars.map((_, id) => id);
  room.game.time = 10;
  object.enqueueScore(room);
  await ctx.drain();
  assert.equal(await ctx.storage.getAlarm(), room.expiresAt);
  room.expiresAt = Date.now() - 1;
  await object.publishScores();
  assert.ok((await ctx.storage.getAlarm())! > Date.now() + 59000);
  ctx.db.close();
});

test("expired rooms cannot start or continue the simulation while an alarm is delayed", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.now() });
  const ctx = context();
  const object = new RainRoom(ctx, {});
  await ctx.ready();
  await object.operate("create", "ABCDEFGH", "", {
    capacity: 2,
    level: 0,
    name: "Paper",
  });
  const room = object.room as Room;
  room.game = newGame(2, 0, "expiry-game");
  room.players[0].online = true;
  room.expiresAt = Date.now();
  try {
    object.run();
    assert.equal(object.timer, null);
    room.expiresAt = Date.now() + 1000;
    object.run();
    assert.notEqual(object.timer, null);
    t.mock.timers.tick(1000);
    assert.equal(room.game.tick, 0);
    assert.equal(object.timer, null);
  } finally {
    object.stop();
    ctx.db.close();
  }
});

test("regroup alarm finishes existing consent, broadcasts and revokes offline seats before replacement", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
  const { ctx, object, sockets, tokens } = await recoveryRoom();
  try {
    object.applyCommand(
      tokens[0],
      { type: "regroup", gameId: "recovery-game" },
      Date.now(),
    );
    object.applyCommand(
      tokens[1],
      { type: "regroup", gameId: "recovery-game" },
      Date.now(),
    );
    sockets[0].readyState = 3;
    object.webSocketClose(sockets[0]);
    sockets[2].readyState = 3;
    object.webSocketClose(sockets[2]);
    await ctx.drain();
    assert.deepEqual(object.room.regroupVotes, [1]);
    const state = JSON.parse(sockets[1].messages.at(-1)!);
    assert.deepEqual(state.room.regroupVotes, [1]);
    assert.equal(state.room.players.filter((p: any) => p.online).length, 1);
    assert.equal(await ctx.storage.getAlarm(), Date.now() + 15000);
    t.mock.timers.tick(14999);
    await object.alarm();
    assert.equal(object.room.phase, "game");
    t.mock.timers.tick(1);
    await object.alarm();
    await ctx.drain();
    assert.equal(object.room.phase, "lobby");
    assert.equal(object.room.level, 15);
    assert.equal(object.room.host, 1);
    assert.equal(object.room.game, null);
    assert.equal(JSON.parse(sockets[1].messages.at(-1)!).room.phase, "lobby");
    assert.equal(sockets[0].deserializeAttachment().slot, -1);
    assert.equal(sockets[2].deserializeAttachment().slot, -1);
    assert.equal(sockets[0].closeCode, 1008);
    assert.equal(
      (await object.operate("state", "ABCDEFGH", tokens[0], {})).status,
      401,
    );
    assert.equal(
      ctx.db.prepare("SELECT COUNT(*) n FROM score_outbox").get()!.n,
      0,
    );
    const replaced = await object.operate("join", "ABCDEFGH", "", {
      name: "replacement",
    });
    assert.equal(replaced.status, 200);
    assert.equal(replaced.data.slot, 0);
    assert.equal(
      (await object.operate("state", "ABCDEFGH", tokens[0], {})).status,
      401,
    );
  } finally {
    object.stop();
    await ctx.drain();
    ctx.db.close();
  }
});

for (const action of ["reconnect", "cancel"] as const)
  test(`regroup alarm rechecks ${action} immediately before the deadline`, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
    const { ctx, object, sockets, tokens } = await recoveryRoom();
    try {
      sockets[0].readyState = 3;
      object.webSocketClose(sockets[0]);
      object.applyCommand(
        tokens[1],
        { type: "regroup", gameId: "recovery-game" },
        Date.now(),
      );
      object.applyCommand(
        tokens[2],
        { type: "regroup", gameId: "recovery-game" },
        Date.now(),
      );
      await ctx.drain();
      assert.equal(await ctx.storage.getAlarm(), Date.now() + 15000);
      t.mock.timers.tick(14999);
      if (action === "cancel") {
        object.applyCommand(
          tokens[1],
          { type: "cancel-regroup", gameId: "recovery-game" },
          Date.now(),
        );
      } else {
        // A new authenticated socket reconnects the same seat; the stale socket
        // is revoked and the returning player must explicitly consent again.
        const reconnect = roomSocket(-1, tokens[0]);
        sockets.push(reconnect);
        object.webSocketMessage(
          reconnect,
          JSON.stringify({
            type: "hello",
            version: object.room.game.rulesVersion,
            token: tokens[0],
          }),
        );
        assert.equal(object.room.players[0].online, true);
        assert.ok(!object.room.regroupVotes.includes(0));
        assert.equal(sockets[0].deserializeAttachment().slot, -1);
      }
      t.mock.timers.tick(1);
      await object.alarm();
      await ctx.drain();
      assert.equal(object.room.phase, "game");
      assert.equal(object.room.game.id, "recovery-game");
      assert.equal(object.room.players.length, 3);
      assert.equal(await ctx.storage.getAlarm(), object.room.expiresAt);
    } finally {
      object.stop();
      await ctx.drain();
      ctx.db.close();
    }
  });

test("regroup deadline survives object reload and does not replace a score retry or expiry deadline", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
  const env = {
    LEADERBOARDS: {
      getByName: () => ({
        submitVerified: async () => {
          throw new Error("outage");
        },
      }),
    },
  };
  const { ctx, object, sockets, tokens } = await recoveryRoom(env);
  let restored: typeof object | undefined;
  try {
    const room = object.room as Room;
    room.game!.status = "won";
    room.game!.stars = LEVELS[15].stars.map((_, id) => id);
    object.enqueueScore(room);
    await ctx.drain();
    const queued = ctx.db.prepare("SELECT data FROM score_outbox").get()!.data;
    sockets[0].readyState = 3;
    object.webSocketClose(sockets[0]);
    object.applyCommand(
      tokens[1],
      { type: "regroup", gameId: "recovery-game" },
      Date.now(),
    );
    object.applyCommand(
      tokens[2],
      { type: "regroup", gameId: "recovery-game" },
      Date.now(),
    );
    await ctx.drain();
    assert.equal(await ctx.storage.getAlarm(), Date.now() + 15000);
    restored = new RainRoom(ctx, env);
    await ctx.ready();
    assert.deepEqual(restored.room.regroupVotes, [1, 2]);
    // Constructor may schedule a quicker durable score retry; it must not drop
    // the upcoming grace period while processing that earlier alarm.
    assert.equal(await ctx.storage.getAlarm(), Date.now() + 1000);
    t.mock.timers.tick(1000);
    await restored.alarm();
    await ctx.drain();
    assert.equal(await ctx.storage.getAlarm(), Date.now() + 14000);
    t.mock.timers.tick(14000);
    await restored.alarm();
    await ctx.drain();
    assert.equal(restored.room.phase, "lobby");
    assert.equal(restored.room.level, 16);
    assert.equal(
      ctx.db.prepare("SELECT data FROM score_outbox").get()!.data,
      queued,
    );
    assert.equal(await ctx.storage.getAlarm(), Date.now() + 60000);
    restored.room.expiresAt = Date.now() + 1000;
    await restored.scheduleAlarm();
    assert.equal(await ctx.storage.getAlarm(), restored.room.expiresAt);
  } finally {
    object.stop();
    restored?.stop();
    await ctx.drain();
    ctx.db.close();
  }
});
