import { CHAPTER_STORAGE_SUFFIXES } from "../src/chapter-storage";
import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  MODES,
  newGame,
  idleInput,
  stepGame,
  type Mode,
} from "../src/game";
import {
  ReplayRecorder,
  inputMask,
  maskInput,
  verifyReplay,
  MAX_REPLAY_TICKS,
  MAX_REPLAY_SEGMENTS,
} from "../src/replay";
import {
  boardName,
  validPlayerToken,
  RANKING_VERSION,
  type LeaderboardData,
} from "../src/leaderboard";
import { rankingRequest } from "../src/ranking-client";
import { makeRoom, publicRoom, command, joinRoom } from "../src/room";
import { completeLevel } from "./journey";
import { RAIN_DIFFICULTIES } from "../src/rain-difficulty";
test("rebuilt maps and all-star rules use a new replay version and separate leaderboard storage", () => {
  assert.equal(RANKING_VERSION, 11);
  for (let level = 0; level < LEVELS.length; level++)
    for (const mode of MODES)
      assert.equal(
        boardName(level, mode),
        `v${[37, 38].includes(level) ? 5 : [28, 29, 31, 33, 34, 35, 39].includes(level) ? 4 : level === 13 || level === 14 ? 2 : 3}:${mode}:${CHAPTER_STORAGE_SUFFIXES[level]}`,
      );
});

test("rain difficulty boards retain every normal board name and isolate all three modes", () => {
  const names = LEVELS.flatMap((_, level) =>
    MODES.flatMap((mode) => {
      const normal = boardName(level, mode);
      assert.equal(boardName(level, mode, "normal"), normal);
      assert.equal(boardName(level, mode, "easy"), `${normal}:rain-easy`);
      assert.equal(boardName(level, mode, "hard"), `${normal}:rain-hard`);
      return RAIN_DIFFICULTIES.map((difficulty) =>
        boardName(level, mode, difficulty),
      );
    }),
  );
  assert.equal(new Set(names).size, LEVELS.length * MODES.length * 3);
});

test("ranking requests include difficulty and reject missing or mismatched response difficulty", async (t) => {
  let response: unknown;
  const calls: { url: string; body?: string }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      calls.push({
        url,
        body: typeof options.body === "string" ? options.body : undefined,
      });
      return Response.json(response);
    },
  );
  for (const rainDifficulty of RAIN_DIFFICULTIES) {
    const data: LeaderboardData = {
      level: 0,
      mode: 1,
      rainDifficulty,
      entries: [],
    };
    response = data;
    assert.deepEqual(
      await rankingRequest(`?level=0&mode=1&rainDifficulty=${rainDifficulty}`),
      data,
    );
    assert.ok(calls.at(-1)?.url.endsWith(`&rainDifficulty=${rainDifficulty}`));
    await rankingRequest("", {
      level: 0,
      rainDifficulty,
      name: "Paper",
      playerToken: crypto.randomUUID(),
      replay: [[1, 1]],
    });
    assert.equal(
      JSON.parse(calls.at(-1)!.body!).rainDifficulty,
      rainDifficulty,
    );
  }
  response = { level: 0, mode: 1, rainDifficulty: "normal", entries: [] };
  await assert.rejects(
    rankingRequest("?level=0&mode=1&rainDifficulty=easy"),
    /返回的数据无效/,
  );
  response = { level: 0, mode: 1, entries: [] };
  await assert.rejects(rankingRequest("?level=0&mode=1"), /返回的数据无效/);
  const before = calls.length;
  await assert.rejects(
    rankingRequest("?level=0&mode=1&rainDifficulty=invalid"),
    /雨速无效/,
  );
  assert.equal(calls.length, before);
});

test("a replay runs with the selected rain rules rather than silently using normal rain", () => {
  const recorder = new ReplayRecorder();
  const original = completeLevel(12, undefined, (game, input) =>
    recorder.record(game, input),
  );
  const replay = recorder.snapshot(original);
  const variants = RAIN_DIFFICULTIES.map((difficulty) =>
    verifyReplay(12, replay, difficulty),
  );
  for (const [index, difficulty] of RAIN_DIFFICULTIES.entries()) {
    const verified = variants[index];
    assert.equal(verified.rainDifficulty, difficulty);
    assert.equal(verified.status, "won");
    assert.equal(verified.time, original.time);
    assert.deepEqual(verified.stars, original.stars);
  }
  assert.notEqual(
    variants[0].players[0].wetness,
    variants[2].players[0].wetness,
  );
});

test("every legal combination of gameplay inputs survives replay encoding", () => {
  for (let mask = 0; mask < 256; mask++) {
    if ((mask & 3) === 3) continue;
    assert.equal(inputMask(maskInput(mask)), mask);
  }
});
for (let level = 0; level < LEVELS.length; level++)
  test(`chapter ${level + 1}: full recorded journey verifies with the exact finish time`, () => {
    const recorder = new ReplayRecorder();
    const game = completeLevel(level, undefined, (g, input) =>
      recorder.record(g, input),
    );
    const replay = recorder.snapshot(game)!;
    assert.ok(replay.length > 1);
    const verified = verifyReplay(level, replay);
    assert.equal(verified.status, "won");
    assert.equal(verified.time, game.time);
    assert.deepEqual(verified.keys, game.keys);
    assert.deepEqual(verified.stars, game.stars);
    assert.throws(() => verifyReplay(level, [...replay, [1, 1]]), /多余/);
    replay[0][1]++;
    assert.notDeepEqual(
      replay,
      recorder.snapshot(game),
      "upload snapshots cannot mutate the recorder",
    );
  });

test("restart drops the previous trace; gaps and unfinished runs cannot submit", () => {
  const recorder = new ReplayRecorder(),
    first = newGame(1, 0, "first");
  recorder.record(first, idleInput());
  stepGame(first, {});
  assert.equal(recorder.snapshot(first), null);
  const game = completeLevel(0, undefined, (g, input) =>
    recorder.record(g, input),
  );
  assert.equal(verifyReplay(0, recorder.snapshot(game)).tick, game.tick);
  const missing = newGame(1, 0, "missing");
  stepGame(missing, {});
  recorder.record(missing, idleInput());
  missing.status = "won";
  assert.equal(recorder.snapshot(missing), null);
});

test("malformed, excessive and fabricated clear submissions are rejected", () => {
  for (const trace of [
    null,
    {},
    [],
    [[1, 0]],
    [[1, -1]],
    [[1, 1.5]],
    [[1, Infinity]],
    [[1, 1, 1]],
    [[3, 2]],
    [[256, 1]],
    [[-1, 1]],
    [[1.5, 1]],
    [[1, MAX_REPLAY_TICKS + 1]],
    Array(MAX_REPLAY_SEGMENTS + 1).fill([1, 1]),
    [[1, 10]],
  ])
    assert.throws(() => verifyReplay(0, trace));
});

test("boards are separate for every chapter and mode; invalid targets and identities fail", () => {
  const keys = new Set(
    LEVELS.flatMap((_, level) => MODES.map((mode) => boardName(level, mode))),
  );
  assert.equal(keys.size, LEVELS.length * MODES.length);
  for (const level of [-1, LEVELS.length, 0.1, NaN])
    assert.throws(() => boardName(level, 1));
  assert.throws(() => boardName(0, 4 as Mode));
  assert.ok(validPlayerToken(crypto.randomUUID()));
  for (const token of [null, "", "fake", 123])
    assert.equal(validPlayerToken(token), false);
});

test("public rooms never disclose ranking credentials and full restart clears upload status", () => {
  const room = makeRoom("ABCDEFGH", 2, 0, "A", "secret", 0);
  room.players[0].rankKey = "private-rank-key";
  assert.ok(!JSON.stringify(publicRoom(room)).includes("private-rank-key"));
  assert.ok(!JSON.stringify(publicRoom(room)).includes("secret"));
  joinRoom(room, "B", "guest-secret", 0);
  room.phase = "game";
  room.game = newGame(2, 0, "old");
  room.rankingStatus = "saved";
  room.votes = [1];
  const restarted = command(
    room,
    "secret",
    { type: "restart", gameId: "old", next: false },
    1,
    "new",
  );
  assert.equal(restarted.game!.id, "new");
  assert.equal(restarted.rankingStatus, undefined);
});
