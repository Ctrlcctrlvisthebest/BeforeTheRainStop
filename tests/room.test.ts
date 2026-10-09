import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, newGame } from "../src/game";
import {
  makeRoom,
  joinRoom,
  command,
  publicRoom,
  authenticate,
} from "../src/room";
test("rooms admit the requested count, keep tokens private and enforce host start", () => {
  for (const n of [2, 3, 6]) {
    const r = makeRoom("ABCDEFGH", n, 0, "host", "host-token", 0);
    for (let i = 1; i < n; i++) joinRoom(r, "peer", `p${i}`, 0);
    assert.throws(() => joinRoom(r, "extra", "extra", 0), /已满/);
    assert.throws(() => command(r, "p1", { type: "start" }, 0, "g"), /房主/);
    assert.throws(
      () => command(r, "host-token", { type: "start" }, 0, "g"),
      /连接/,
    );
    r.players.forEach((p) => (p.online = true));
    const started = command(r, "host-token", { type: "start" }, 0, "g");
    assert.equal(started.game?.players.length, n);
    assert.ok(publicRoom(started).players.every((p) => !("token" in p)));
    assert.throws(() => authenticate(r, "wrong"), /凭证/);
  }
});
test("public room snapshots remain isolated from server state and never expose seat or ranking credentials", () => {
  let room = makeRoom("ABCDEFGH", 2, 0, "host", "private-host-token", 0);
  joinRoom(room, "peer", "private-peer-token", 0);
  room.players.forEach((player) => {
    player.online = true;
    player.rankKey = `private-rank-${player.slot}`;
  });
  room = command(room, "private-host-token", { type: "start" }, 0, "run");
  room.game!.keys = [0];
  room.game!.stars = [0];
  room.game!.players[0].carriedStars = [1];
  room.votes = [0];
  room.regroupVotes = [1];
  room.turnNotice = { slot: 1, at: 100, gameId: "run" };
  const before = structuredClone(room);
  const snapshot = publicRoom(room);
  assert.ok(
    snapshot.players.every(
      (player) => !("token" in player) && !("rankKey" in player),
    ),
  );
  assert.doesNotMatch(JSON.stringify(snapshot), /private-(?:host|peer|rank)/);

  // Prediction and UI consumers can edit the public snapshot without changing
  // the authoritative room, its vote decisions, or a teammate's saved items.
  snapshot.players[0].name = "renamed locally";
  snapshot.players[0].online = false;
  snapshot.players[0].lastSeen = 999;
  snapshot.players.push({
    slot: 5,
    name: "local",
    online: true,
    lastSeen: 999,
  });
  snapshot.game!.players[0].x += 10;
  snapshot.game!.players[0].carriedStars.push(2);
  snapshot.game!.keys.push(1);
  snapshot.game!.stars.splice(0);
  snapshot.votes.push(1);
  snapshot.regroupVotes!.splice(0);
  snapshot.turnNotice!.slot = 0;
  snapshot.turnNotice!.at = 999;
  assert.deepEqual(room, before);
});
test("restarting needs every vote and cannot advance unfinished level", () => {
  let r = makeRoom("ABCDEFGH", 2, 0, "host", "a", 0);
  joinRoom(r, "peer", "b", 0);
  r.players.forEach((p) => (p.online = true));
  r = command(r, "a", { type: "start" }, 0, "g");
  r = command(r, "a", { type: "restart", gameId: "g", next: true }, 0, "g2");
  assert.equal(r.game?.id, "g");
  r = command(r, "b", { type: "restart", gameId: "g", next: true }, 0, "g2");
  assert.equal(r.game?.id, "g2");
  assert.equal(r.level, 0);
  assert.throws(
    () => command(r, "a", { type: "restart", gameId: "g" }, 0, "g3"),
    /更新/,
  );
  r.game!.status = "won";
  r = command(r, "a", { type: "restart", gameId: "g2", next: true }, 0, "g3");
  r = command(r, "b", { type: "restart", gameId: "g2", next: true }, 0, "g3");
  assert.equal(r.level, 1);
});
test("a same-chapter restart clears the whole run only after every player agrees", () => {
  for (const mode of [2, 3, 6] as const) {
    let room = makeRoom("ABCDEFGH", mode, 1, "host", "p0", 0);
    for (let slot = 1; slot < mode; slot++)
      joinRoom(room, "friend", `p${slot}`, 0);
    room.players.forEach((p) => (p.online = true));
    room = command(room, "p0", { type: "start" }, 0, "old");
    Object.assign(room.game!, {
      time: 100,
      tick: 6000,
      motionTime: 95,
      keys: [0],
      savedKeys: [0],
      stars: [0],
      savedStars: [0],
      view: 1,
      flips: 3,
      gateOpen: true,
      bridgeLatched: true,
    });
    room.game!.players.forEach((p) =>
      Object.assign(p, {
        x: 20,
        z: -7,
        checkpoint: 1,
        carriedStars: [1],
        deaths: 2,
        wetness: 80,
        heat: 30,
        foldsLeft: 1,
      }),
    );
    const old = structuredClone(room.game);
    for (let slot = 0; slot < mode; slot++) {
      room = command(
        room,
        `p${slot}`,
        { type: "restart", gameId: "old", next: false },
        0,
        "fresh",
      );
      if (slot < mode - 1)
        assert.deepEqual(room.game, old, "pending votes preserve the run");
    }
    assert.equal(room.level, 1);
    assert.deepEqual(room.game, newGame(mode, 1, "fresh"));
    assert.deepEqual(room.votes, []);
    assert.equal(room.voteNext, null);
  }
});

test("leaving lobby transfers hosting and permits replacement", () => {
  let r = makeRoom("ABCDEFGH", 2, 0, "host", "a", 0);
  joinRoom(r, "peer", "b", 0);
  r = command(r, "a", { type: "leave" }, 0, "g");
  assert.equal(r.host, 1);
  assert.equal(joinRoom(r, "new", "c", 0), 0);
});

for (const level of [3, 7, LEVELS.length - 1])
  test(`chapter ${level + 1} advances through the full campaign after all votes`, () => {
    let r = makeRoom("ABCDEFGH", 3, level, "host", "a", 0);
    joinRoom(r, "friend", "b", 0);
    joinRoom(r, "friend", "c", 0);
    r.players.forEach((p) => (p.online = true));
    r = command(r, "a", { type: "start" }, 0, "g");
    r.game!.status = "won";
    for (const token of ["a", "b"])
      r = command(
        r,
        token,
        { type: "restart", gameId: "g", next: true },
        0,
        "g2",
      );
    assert.equal(r.level, level);
    r = command(r, "c", { type: "restart", gameId: "g", next: true }, 0, "g2");
    assert.equal(r.level, (level + 1) % LEVELS.length);
    assert.deepEqual(r.game!.savedKeys, []);
  });
