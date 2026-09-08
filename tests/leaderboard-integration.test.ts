import test from "node:test";
import assert from "node:assert/strict";
import { ReplayRecorder, verifyReplay, type Replay } from "../src/replay";
import { completeLevel } from "./journey";
import { RANKING_VERSION, type LeaderboardData } from "../src/leaderboard";
import { NAME_REJECTED } from "../src/name-policy";

const base = process.env.TEST_SERVER ?? "http://127.0.0.1:8788";
// These tests create sample scores. They must never write to the public boards.
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  throw new Error("Leaderboard integration tests require a local Worker");
const recorder = new ReplayRecorder();
const game = completeLevel(0, undefined, (g, input) =>
  recorder.record(g, input),
);
const replay = recorder.snapshot(game)!;
const slow: Replay = [[1, 30], ...replay];
assert.equal(verifyReplay(0, slow).status, "won");

test("local Worker verifies clears, publishes top three, replaces faster times and protects board boundaries", async () => {
  const get = async (query = "level=0&mode=1") =>
    fetch(`${base}/api/leaderboard?${query}`);
  const post = async (body: unknown) =>
    fetch(`${base}/api/leaderboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const body = {
    version: RANKING_VERSION,
    level: 0,
    replay,
    playerToken: crypto.randomUUID(),
    name: "雨中旅人",
  };
  for (const invalid of [
    { ...body, replay: [[1, 1]], timeMs: 1 },
    { ...body, mode: 2 },
    { ...body, playerToken: "fake" },
    { ...body, level: 99 },
  ]) {
    const response = await post(invalid);
    assert.equal(response.status, 400);
  }
  assert.equal((await post({ ...body, version: -1 })).status, 409);
  assert.equal((await get("level=0&mode=4")).status, 400);
  const initial = (await (await get()).json()) as LeaderboardData;
  for (const name of ["習 近平", "ＸＩ＿ＪＩＮＰＩＮＧ", "习\u200b近平"]) {
    const denied = await post({ ...body, name });
    assert.equal(denied.status, 422);
    assert.deepEqual(await denied.json(), { error: NAME_REJECTED });
  }
  assert.deepEqual(
    await (await get()).json(),
    initial,
    "rejected names never alter the board",
  );
  const first = await post({ ...body, replay: slow, timeMs: 1 });
  assert.equal(first.status, 200, await first.text());
  const faster = await post(body);
  assert.equal(faster.status, 200);
  const entries = ((await faster.json()) as LeaderboardData).entries;
  assert.ok(
    entries.some(
      (entry) =>
        entry.names[0] === body.name &&
        entry.timeMs === Math.round(game.time * 1000),
    ) || initial.entries.length === 3,
  );
  await post({ ...body, replay: slow });
  for (const name of ["风铃", "折纸愿望", "长昵称abcdefghijklmnop"]) {
    const result = await post({
      ...body,
      name,
      playerToken: crypto.randomUUID(),
    });
    assert.equal(result.status, 200);
  }
  const top = ((await (await get()).json()) as LeaderboardData).entries;
  assert.equal(top.length, 3);
  assert.ok(
    top.every((entry, i) => i === 0 || entry.timeMs >= top[i - 1].timeMs),
  );
  assert.ok(
    top.every(
      (entry) =>
        !JSON.stringify(entry).includes("playerToken") &&
        entry.names[0].length <= 16,
    ),
  );
  for (const mode of [2, 3, 6])
    assert.deepEqual(
      ((await (await get(`level=0&mode=${mode}`)).json()) as LeaderboardData)
        .entries,
      [],
    );
  assert.deepEqual(
    ((await (await get("level=1&mode=1")).json()) as LeaderboardData).entries,
    [],
  );
  assert.equal(
    (await post({ ...body, padding: "x".repeat(512 * 1024) })).status,
    413,
  );
  const forbidden = await fetch(`${base}/api/leaderboard?level=0&mode=1`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(forbidden.status, 403);
  const room = await fetch(`${base}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      capacity: 2,
      level: 0,
      name: "host",
      playerToken: body.playerToken,
    }),
  });
  const created = (await room.json()) as {
    room: { code: string };
    token: string;
  };
  assert.equal(room.status, 201);
  for (const endpoint of [
    "/api/rooms",
    `/api/rooms/${created.room.code}/join`,
  ]) {
    const denied = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capacity: 2,
        level: 0,
        name: "習\u200b近平",
        playerToken: body.playerToken,
      }),
    });
    assert.equal(denied.status, 422);
    assert.deepEqual(await denied.json(), { error: NAME_REJECTED });
  }
  const joined = await fetch(`${base}/api/rooms/${created.room.code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "同伴", playerToken: crypto.randomUUID() }),
  });
  assert.equal(
    joined.status,
    200,
    "a rejected name must not consume the remaining seat",
  );
  const unauthorized = await fetch(
    `${base}/api/rooms/${created.room.code}/score`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(unauthorized.status, 401);
  assert.ok(!JSON.stringify(created.room).includes("rankKey"));
  console.log(
    "Verified sample scores stored only in local development SQLite.",
  );
});
