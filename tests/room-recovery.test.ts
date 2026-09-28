import test from "node:test";
import assert from "node:assert/strict";
import { makeRoom, joinRoom, command, authenticate } from "../src/room";
function room() {
  const r = makeRoom("ABCDEFGH", 3, 15, "host", "a", 0);
  joinRoom(r, "friend", "b", 0);
  joinRoom(r, "friend", "c", 0);
  r.players.forEach((p) => (p.online = true));
  return command(r, "a", { type: "start" }, 0, "game");
}
test("regroup waits for reconnection grace, needs online consent and frees offline credentials", () => {
  let r = room();
  r.players[0].online = false;
  r.players[0].lastSeen = 100;
  assert.throws(
    () => command(r, "b", { type: "regroup", gameId: "game" }, 1000, "new"),
    /15 秒/,
  );
  assert.throws(
    () => command(r, "b", { type: "regroup", gameId: "old" }, 20000, "new"),
    /更新/,
  );
  r = command(r, "b", { type: "regroup", gameId: "game" }, 20000, "new");
  assert.equal(r.phase, "game");
  assert.deepEqual(r.regroupVotes, [1]);
  r = command(r, "c", { type: "regroup", gameId: "game" }, 20000, "new");
  assert.equal(r.phase, "lobby");
  assert.equal(r.game, null);
  assert.equal(r.level, 15);
  assert.equal(r.host, 1);
  assert.throws(() => authenticate(r, "a"), /凭证/);
  const slot = joinRoom(r, "replacement", "d", 20001);
  assert.equal(slot, 0);
  r.players.find((p) => p.token === "d")!.online = true;
  r = command(r, "b", { type: "start" }, 21000, "new");
  assert.equal(r.game!.time, 0);
  assert.equal(r.game!.mode, 3);
  assert.equal(r.game!.id, "new");
});
test("regroup preserves completed chapter, and votes may be cancelled", () => {
  let r = room();
  r.game!.status = "won";
  r = command(r, "a", { type: "regroup", gameId: "game" }, 20000, "new");
  r = command(r, "a", { type: "cancel-regroup" }, 20001, "new");
  assert.deepEqual(r.regroupVotes, []);
  for (const token of ["a", "b", "c"])
    r = command(r, token, { type: "regroup", gameId: "game" }, 20002, "new");
  assert.equal(r.level, 16);
  assert.equal(r.phase, "lobby");
  assert.equal(r.votes.length, 0);
});
test("a turn signal is rate limited and never rotates or advances physics", () => {
  let r = room();
  r = command(r, "b", { type: "turn-signal", gameId: "game" }, 20000, "new");
  assert.deepEqual(r.turnNotice, { slot: 1, at: 20000, gameId: "game" });
  assert.equal(r.game!.view, 0);
  assert.equal(r.game!.time, 0);
  assert.throws(
    () =>
      command(r, "a", { type: "turn-signal", gameId: "game" }, 20001, "new"),
    /稍后/,
  );
  r = command(r, "a", { type: "turn-signal", gameId: "game" }, 24000, "new");
  assert.equal(r.turnNotice!.slot, 0);
});
