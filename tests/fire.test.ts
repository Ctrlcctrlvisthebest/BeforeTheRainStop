import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  stepGame,
  idleInput,
  LEVELS,
  type Game,
  type Inputs,
} from "../src/game";
import {
  CAMPFIRES,
  WEATHER,
  besideCampfire,
  underAwning,
  FIRE_WARNING,
} from "../src/weather";
const tick = (g: Game, n = 1, inputs: Inputs = {}) => {
  for (let i = 0; i < n; i++) stepGame(g, inputs);
};
test("every awning has a small fire; every blazing obstacle is roofed", () => {
  for (let l = 0; l < 4; l++) {
    assert.equal(CAMPFIRES[l].length, WEATHER[l].awnings.length);
    CAMPFIRES[l].forEach((f) => assert.equal(underAwning(l, f), true));
    LEVELS[l].hazards.forEach((f) => {
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          assert.equal(
            underAwning(l, {
              x: f.x + (x * f.w) / 2,
              y: f.y,
              z: f.z + (z * f.d) / 2,
            }),
            true,
          );
    });
  }
});
test("all starting seats remain safely away from heat while waiting for teammates", () => {
  for (let l = 0; l < 4; l++) {
    const g = newGame(6, l);
    tick(g, 720);
    assert.ok(g.players.every((p) => p.deaths === 0 && p.heat === 0));
  }
});
test("a small fire dries fully wet paper before the warning threshold", () => {
  const g = newGame(1),
    p = g.players[0];
  Object.assign(p, { x: 10, y: 0, z: 0, wetness: 99 });
  tick(g, 240);
  assert.equal(p.wetness, 0);
  assert.ok(p.nearFire);
  assert.ok(p.heat > 49 && p.heat < FIRE_WARNING);
  assert.equal(p.deaths, 0);
});
test("staying by a fire warns, then shatters only that crane and preserves team progress", () => {
  const g = newGame(2),
    p = g.players[0];
  g.keys = [0];
  g.stars = [0];
  Object.assign(p, { x: 10, y: 0, z: 0, checkpoint: 0 });
  tick(g, 330);
  assert.ok(p.heat >= FIRE_WARNING);
  assert.equal(p.deaths, 0);
  tick(g, 160);
  assert.equal(p.deaths, 1);
  assert.equal(p.lastFailure, "brittle");
  assert.equal(p.heat, 0);
  assert.equal(g.players[1].deaths, 0);
  assert.deepEqual(g.keys, [0]);
  assert.deepEqual(g.stars, [0]);
  assert.ok(p.failureUntil > g.time);
});
test("leaving the heat cools paper without drying it elsewhere", () => {
  const g = newGame(1),
    p = g.players[0];
  Object.assign(p, { x: 10, y: 0, z: 0, wetness: 90 });
  tick(g, 60);
  const wet = p.wetness;
  Object.assign(p, { x: 1, y: 0, z: 0 });
  tick(g, 90);
  assert.equal(p.heat, 0);
  assert.equal(p.wetness, wet);
  assert.equal(p.nearFire, false);
});
test("heat range uses real position and floor height in both views", () => {
  const f = CAMPFIRES[2][1];
  for (const view of [0, 1] as const) {
    const g = newGame(1, 2),
      p = g.players[0];
    g.view = view;
    Object.assign(p, { x: f.x, y: f.y, z: f.z, wetness: 50 });
    tick(g, 30);
    assert.ok(p.heat > 0);
  }
  assert.equal(besideCampfire(2, { ...f, y: 0 }), false);
  assert.equal(besideCampfire(2, { ...f, x: f.x + 1.6 }), false);
  assert.equal(besideCampfire(2, { ...f, y: f.y + 1.2 }), false);
});
test("repairing, unfolding and switching view do not reset heat", () => {
  const g = newGame(1),
    p = g.players[0];
  Object.assign(p, { x: 10, y: 0, z: 0, heat: 50, wetness: 99 });
  tick(g, 125, { 0: { ...idleInput(), repair: true } });
  assert.ok(p.heat > 75);
  assert.ok(p.wetness > 40);
  tick(g, 1, { 0: { ...idleInput(), shelter: true } });
  assert.ok(p.heat > 75);
  tick(g, 50, { 0: { ...idleInput(), turn: true } });
  assert.ok(p.deaths === 0 && p.heat > 80);
});
for (const view of [0, 1] as const)
  test(`blazing fire burns immediately in view ${view}, even with shelter`, () => {
    for (const time of [0, 2, 5, 9]) {
      const g = newGame(2, 3),
        p = g.players[0];
      g.view = view;
      g.time = time;
      Object.assign(p, { x: 8.8, y: 0, z: 0 });
      tick(g, 1, { 0: { ...idleInput(), shelter: true } });
      assert.equal(p.deaths, 1);
      assert.equal(p.lastFailure, "scorched");
      assert.equal(p.heat, 0);
      assert.equal(g.players[1].deaths, 0);
    }
  });
test("a running jump clears the blazing fire without damage", () => {
  const g = newGame(1, 3),
    p = g.players[0];
  Object.assign(p, { x: 7.1, y: 0, z: 0 });
  tick(g, 43, { 0: { ...idleInput(), axis: 1, jump: true } });
  assert.ok(p.x > 10);
  assert.equal(p.deaths, 0);
});
test("every multiplayer seat respawns on the safe side of the first blaze", () => {
  const g = newGame(6, 3);
  g.players.forEach((p) => Object.assign(p, { checkpoint: 0, y: -8 }));
  tick(g);
  assert.ok(g.players.every((p) => p.x <= 8 && p.deaths === 1));
  tick(g, 120);
  assert.ok(g.players.every((p) => p.deaths === 1));
});
test("old snapshots receive heat and failure fields on the next update", () => {
  const g = newGame(1),
    p = g.players[0] as any;
  for (const key of ["heat", "nearFire", "lastFailure", "failureUntil"])
    delete p[key];
  tick(g);
  assert.equal(p.heat, 0);
  assert.equal(p.nearFire, false);
  assert.equal(p.lastFailure, null);
  assert.equal(p.failureUntil, 0);
});
