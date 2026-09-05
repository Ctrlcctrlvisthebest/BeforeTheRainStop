import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  idleInput,
  stepGame,
  width,
  LEVELS,
  cleanInput,
  type Game,
  type Input,
} from "../src/game";
import { completeLevel } from "./journey";
function tick(g: Game, i: Partial<Input> = {}, n = 1) {
  for (let t = 0; t < n; t++) stepGame(g, { 0: { ...idleInput(), ...i } });
}
for (let i = 0; i < 4; i++)
  test(`level ${i + 1}: run, jump, turn, collect keys and finish without teleporting`, () => {
    const g = completeLevel(i);
    assert.equal(g.status, "won");
    assert.equal(g.players[0].deaths, 0);
    assert.ok(g.flips >= 2);
    assert.equal(g.keys.length, LEVELS[i].keys.length);
  });
test("direct movement, gravity and held jump gliding", () => {
  const g = newGame(1);
  tick(g, { axis: 1 }, 30);
  assert.ok(g.players[0].x > 1);
  assert.equal(g.players[0].y, 0);
  const glide = structuredClone(g),
    fall = structuredClone(g);
  tick(glide, { jump: true }, 55);
  tick(fall, { jump: true });
  tick(fall, {}, 54);
  assert.ok(glide.players[0].y > fall.players[0].y + 0.5);
  assert.equal(fall.players[0].grounded, true);
});
test("Q rotates movement axis without teleporting and holding Q turns only once", () => {
  const g = newGame(1);
  const b = g.players[0];
  tick(g, { turn: true }, 60);
  assert.equal(g.view, 1);
  assert.equal(g.flips, 1);
  assert.equal(b.x, -1);
  assert.equal(b.z, 0);
  tick(g, { axis: 1 }, 10);
  assert.equal(b.x, -1);
  assert.ok(b.z < -0.1);
});
test("wall blocks running, but the side corridor is physically open", () => {
  const g = newGame(1);
  const b = g.players[0];
  Object.assign(b, { x: 11, y: 0, z: 0 });
  tick(g, { axis: 1 }, 40);
  assert.ok(b.x < 12);
  Object.assign(b, { x: 11, y: 0, z: 0 });
  tick(g, { turn: true }, 55);
  tick(g, { axis: 1 }, 75);
  assert.ok(b.z < -6);
  assert.equal(b.deaths, 0);
});
test("jumping on another bird creates a stack; a folded bird provides a wider landing surface", () => {
  const g = newGame(2);
  Object.assign(g.players[0], { x: 0, y: 0 });
  Object.assign(g.players[1], { x: 0, y: 2, grounded: false });
  for (let n = 0; n < 40; n++) stepGame(g, {});
  assert.equal(g.players[1].y, 0.88);
  assert.equal(g.players[1].grounded, true);
  Object.assign(g.players[1], { x: 1.2, y: 1.8, grounded: false });
  for (let n = 0; n < 40; n++)
    stepGame(g, { 0: { ...idleInput(), fold: true } });
  assert.equal(g.players[1].y, 0.28);
  assert.equal(width(g.players[0], 0, "x"), 3.2);
});
test("falling restores individual checkpoint and preserves team collectibles", () => {
  const g = newGame(1);
  g.keys = [0];
  Object.assign(g.players[0], { checkpoint: 1, x: 100, y: -8 });
  tick(g);
  assert.equal(g.players[0].deaths, 1);
  assert.equal(g.players[0].x, 16);
  assert.equal(g.players[0].z, -7);
  assert.deepEqual(g.keys, [0]);
});
for (const mode of [1, 2, 3, 6] as const)
  test(`${mode} players: pressure pad requirement and every bird must arrive`, () => {
    const g = newGame(mode, 1);
    g.keys = [0];
    Object.assign(g.players[0], { x: 16, y: 0, z: -7 });
    tick(g);
    assert.equal(g.gateOpen, mode === 1);
    if (mode > 1) {
      Object.assign(g.players[1], { x: 19, y: 0, z: -7 });
      tick(g);
      assert.equal(g.gateOpen, true);
    }
    Object.assign(g.players[0], { x: 29, y: 0, z: -7 });
    tick(g);
    assert.equal(g.status, mode === 1 ? "won" : "playing");
    for (const p of g.players) Object.assign(p, { x: 29, y: 0, z: -7 });
    tick(g);
    assert.equal(g.status, "won");
  });
test("moving platforms carry grounded riders", () => {
  const g = newGame(1, 2),
    b = g.players[0];
  Object.assign(b, { x: 23, y: 1.2, z: -7, support: 5 });
  tick(g, {}, 30);
  assert.ok(b.x > 23.7);
  assert.equal(b.y, 1.2);
});
test("network input validation rejects invalid motion and strips seat spoofing", () => {
  assert.equal(cleanInput({ ...idleInput(), axis: 100 }), null);
  assert.equal(cleanInput({ ...idleInput(), jump: "yes" }), null);
  assert.deepEqual(cleanInput({ ...idleInput(), slot: 5 }), idleInput());
});
