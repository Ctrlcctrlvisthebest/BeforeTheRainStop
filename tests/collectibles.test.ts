import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  stepGame,
  idleInput,
  LEVELS,
  type Game,
  type Bird,
  type Point,
} from "../src/game";
const step = (g: Game) => stepGame(g, {});
function place(b: Bird, point: Point) {
  Object.assign(b, point, { vx: 0, vy: 0, vz: 0, grounded: false });
}
function pickup(g: Game, slot: number, kind: "keys" | "stars", id: number) {
  const k = LEVELS[g.level][kind][id];
  place(g.players[slot], { ...k, y: k.y - 0.45 });
  step(g);
  assert.ok(g[kind].includes(id));
}
function rack(g: Game, slot: number, index: number) {
  place(g.players[slot], LEVELS[g.level].checkpoints[index]);
  step(g);
}
function fall(g: Game, slot: number) {
  place(g.players[slot], { x: 0, y: -8, z: 0 });
  step(g);
}
test("items beyond a rack reappear on death and can be collected again", () => {
  const g = newGame(1, 4),
    p = g.players[0];
  rack(g, 0, 0);
  pickup(g, 0, "keys", 0);
  pickup(g, 0, "stars", 1);
  assert.deepEqual(g.savedKeys, []);
  assert.deepEqual(p.carriedKeys, [0]);
  assert.deepEqual(p.carriedStars, [1]);
  fall(g, 0);
  assert.deepEqual(g.keys, []);
  assert.deepEqual(g.stars, []);
  assert.equal(p.lastDropped, 2);
  assert.equal(p.checkpoint, 0);
  pickup(g, 0, "keys", 0);
  pickup(g, 0, "stars", 1);
  assert.deepEqual(g.keys, [0]);
  assert.deepEqual(g.stars, [1]);
});
test("revisiting the same rack cannot bank a new pickup; the next new rack does", () => {
  const g = newGame(1, 4),
    p = g.players[0];
  rack(g, 0, 0);
  pickup(g, 0, "keys", 0);
  rack(g, 0, 0);
  assert.deepEqual(g.savedKeys, []);
  assert.deepEqual(p.carriedKeys, [0]);
  rack(g, 0, 1);
  assert.deepEqual(g.savedKeys, [0]);
  assert.deepEqual(p.carriedKeys, []);
  assert.equal(p.lastBanked, 1);
  assert.ok(p.bankedUntil > g.time);
  pickup(g, 0, "keys", 1);
  fall(g, 0);
  assert.deepEqual(g.keys, [0]);
  assert.equal(p.lastDropped, 1);
});
for (const mode of [2, 3, 6] as const)
  test(`${mode} players: only the dying carrier drops items; teammates and saved items survive`, () => {
    const g = newGame(mode, 4);
    rack(g, 0, 0);
    pickup(g, 0, "keys", 0);
    rack(g, 0, 1);
    pickup(g, 0, "keys", 1);
    pickup(g, 1, "keys", 2);
    pickup(g, 1, "stars", 1);
    rack(g, 0, 2);
    assert.deepEqual(g.savedKeys, [0, 1]);
    assert.deepEqual(g.players[1].carriedKeys, [2]);
    // A friend's checkpoint must not bank another crane's carried items.
    fall(g, 1);
    assert.deepEqual(g.keys, [0, 1]);
    assert.deepEqual(g.stars, []);
    assert.equal(g.players[1].lastDropped, 2);
    assert.equal(g.players[0].deaths, 0);
    pickup(g, 1, "keys", 2);
    fall(g, 0);
    assert.deepEqual(g.keys, [0, 1, 2]);
    assert.deepEqual(g.players[1].carriedKeys, [2]);
  });
for (const reason of ["reset", "soaked", "brittle", "scorched"] as const)
  test(`${reason} rolls back unsaved items, preserves saved ones and fold wear`, () => {
    const g = newGame(1, 4),
      p = g.players[0];
    pickup(g, 0, "keys", 0);
    rack(g, 0, 1);
    pickup(g, 0, "stars", 1);
    p.foldsLeft = 2;
    if (reason === "reset") stepGame(g, { 0: { ...idleInput(), reset: true } });
    else if (reason === "soaked") {
      place(p, { x: 18, y: 0, z: 6 });
      p.wetness = 99.999;
      step(g);
    } else if (reason === "brittle") {
      place(p, { x: 12, y: 0, z: 6 });
      p.heat = 99.999;
      step(g);
    } else {
      place(p, LEVELS[4].hazards[0]);
      step(g);
    }
    assert.equal(p.deaths, 1);
    assert.deepEqual(g.keys, [0]);
    assert.deepEqual(g.stars, []);
    assert.equal(p.lastDropped, 1);
    assert.equal(p.foldsLeft, 2);
  });
test("a pickup at a new rack is saved in that same step", () => {
  const g = newGame(1, 7);
  place(g.players[0], LEVELS[7].checkpoints[1]);
  step(g);
  assert.ok(g.keys.includes(1));
  assert.ok(g.savedKeys.includes(1));
  fall(g, 0);
  assert.ok(g.keys.includes(1));
});
test("the final lantern saves the last carried keys and stars", () => {
  const g = newGame(1, 4),
    p = g.players[0];
  for (let i = 0; i < 3; i++) pickup(g, 0, "keys", i);
  pickup(g, 0, "stars", 3);
  g.gateOpen = true;
  place(p, LEVELS[4].exit);
  step(g);
  assert.equal(g.status, "won");
  assert.deepEqual(g.savedKeys, [0, 1, 2]);
  assert.deepEqual(g.savedStars, [3]);
  assert.deepEqual(p.carriedKeys, []);
});
test("room snapshots retain ownership and saved progress after serialization", () => {
  let g = newGame(2, 4);
  pickup(g, 0, "keys", 0);
  rack(g, 0, 1);
  pickup(g, 1, "keys", 1);
  g = JSON.parse(JSON.stringify(g));
  fall(g, 1);
  assert.deepEqual(g.keys, [0]);
  assert.deepEqual(g.savedKeys, [0]);
});
test("old room snapshots migrate existing collection to saved progress", () => {
  const g = newGame(1) as any;
  g.keys = [0];
  g.stars = [0];
  delete g.savedKeys;
  delete g.savedStars;
  for (const key of [
    "carriedKeys",
    "carriedStars",
    "lastDropped",
    "lastBanked",
    "bankedUntil",
  ])
    delete g.players[0][key];
  step(g);
  fall(g, 0);
  assert.deepEqual(g.keys, [0]);
  assert.deepEqual(g.stars, [0]);
  assert.equal(g.players[0].lastDropped, 0);
});

test("branching maps bank new items on return and respawn at the most recently visited rack", () => {
  const g = newGame(1, 29),
    p = g.players[0];
  rack(g, 0, 0);
  rack(g, 0, 1);
  pickup(g, 0, "keys", 0);
  rack(g, 0, 0);
  assert.equal(
    p.checkpoint,
    0,
    "returning from the balcony selects the lower rack again",
  );
  assert.deepEqual(g.savedKeys, [0]);
  pickup(g, 0, "keys", 1);
  fall(g, 0);
  assert.equal(p.checkpoint, 0);
  assert.equal(p.x, LEVELS[29].checkpoints[0].x);
  assert.deepEqual(g.keys, [0], "only the unbanked excursion is lost");
});

test("returning to the same hub banks a later excursion without granting free folds", () => {
  const g = newGame(1, 34),
    p = g.players[0];
  rack(g, 0, 0);
  p.foldsLeft = 2;
  pickup(g, 0, "keys", 0);
  rack(g, 0, 0);
  assert.deepEqual(g.savedKeys, [0]);
  assert.equal(p.foldsLeft, 2);
  pickup(g, 0, "keys", 1);
  rack(g, 0, 0);
  fall(g, 0);
  assert.deepEqual(g.keys, [0, 1]);
  assert.equal(p.foldsLeft, 2);
});
