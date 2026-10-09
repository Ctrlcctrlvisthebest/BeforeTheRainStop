import test from "node:test";
import assert from "node:assert/strict";
import {
  makeRoom,
  joinRoom,
  command,
  authenticate,
  advanceRegroup,
  publicRoom,
} from "../src/room";
import { regroupStatus } from "../src/regroup";
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
  r = command(r, "b", { type: "regroup", gameId: "game" }, 1000, "new");
  assert.deepEqual(r.regroupVotes, [1]);
  assert.equal(r.phase, "game", "consent during grace does not release seats");
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
test("existing online consent completes automatically after a voted member disconnects", () => {
  let r = room();
  r = command(r, "a", { type: "regroup", gameId: "game" }, 100, "new");
  r = command(r, "b", { type: "regroup", gameId: "game" }, 101, "new");
  r.players[0].online = false;
  r.players[0].lastSeen = 200;
  r.players[2].online = false;
  r.players[2].lastSeen = 400;
  const status = regroupStatus(r, 500);
  assert.deepEqual(status.votes, [1]);
  assert.equal(status.onlineCount, 1);
  assert.equal(status.reconnectUntil, 15400);
  assert.equal(status.unanimous, true);
  assert.deepEqual(publicRoom(r).regroupVotes, [1], "never expose 2 / 1");
  assert.strictEqual(advanceRegroup(r, 15399), r);
  const next = advanceRegroup(r, 15400);
  assert.equal(next.phase, "lobby");
  assert.equal(next.host, 1);
  assert.throws(() => authenticate(next, "a"), /凭证/);
  assert.throws(() => authenticate(next, "c"), /凭证/);
  assert.equal(
    r.phase,
    "game",
    "advancing does not mutate the previous snapshot",
  );
});
test("reconnection or cancellation before the deadline prevents automatic regroup", () => {
  let r = room();
  r.players[0].online = false;
  r.players[0].lastSeen = 100;
  r = command(r, "b", { type: "regroup", gameId: "game" }, 200, "new");
  r = command(r, "c", { type: "regroup", gameId: "game" }, 200, "new");
  assert.strictEqual(advanceRegroup(r, 15099), r);
  const reconnected = structuredClone(r);
  reconnected.players[0].online = true;
  assert.strictEqual(advanceRegroup(reconnected, 15100), reconnected);
  assert.equal(
    command(reconnected, "a", { type: "regroup", gameId: "game" }, 15101, "new")
      .phase,
    "lobby",
  );
  r = command(r, "b", { type: "cancel-regroup", gameId: "game" }, 15099, "new");
  assert.strictEqual(advanceRegroup(r, 15100), r);
  assert.deepEqual(r.regroupVotes, [2]);
  assert.throws(
    () =>
      command(r, "c", { type: "cancel-regroup", gameId: "old" }, 15100, "new"),
    /更新/,
  );
});
test("zero online voters and expired rooms never regroup on a delayed alarm", () => {
  const r = room();
  r.regroupVotes = [0, 1, 2];
  r.players.forEach((p) => (p.online = false));
  assert.equal(regroupStatus(r, 20000).unanimous, false);
  assert.strictEqual(advanceRegroup(r, 20000), r);
  r.players[1].online = true;
  r.expiresAt = 20000;
  assert.strictEqual(advanceRegroup(r, 20000), r);
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
