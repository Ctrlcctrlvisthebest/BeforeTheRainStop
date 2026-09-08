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
} from "../src/leaderboard";
import { makeRoom, publicRoom, command, joinRoom } from "../src/room";
import { completeLevel } from "./journey";
test("relaxed route rules update replay validation while preserving existing leaderboard storage", () => {
  assert.equal(RANKING_VERSION, 2);
  for (let level = 0; level < LEVELS.length; level++)
    for (const mode of MODES)
      assert.equal(boardName(level, mode), `v1:${mode}:${LEVELS[level].name}`);
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
