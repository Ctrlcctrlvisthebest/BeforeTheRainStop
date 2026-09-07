import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../src/game";
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
