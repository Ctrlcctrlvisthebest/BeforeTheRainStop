import test from "node:test";
import assert from "node:assert/strict";
import { guideFor, newGuideTracker, GUIDE_ROUTES, words } from "../src/guide";
import { newGame, LEVELS, stepGame, idleInput } from "../src/game";
import { bankPoint, CROSSINGS } from "../src/bridges";
import { completeLevel } from "./journey";
for (let level = 0; level < LEVELS.length; level++)
  test(`chapter ${level + 1}: guidance follows the playable route through to the exit`, () => {
    const tracker = newGuideTracker();
    let last = guideFor(newGame(1, level), 0, tracker),
      turns = 0;
    completeLevel(level, (g) => {
      last = guideFor(g, 0, tracker);
      if (last.direction === "turn") turns++;
      assert.ok(Number.isFinite(last.target?.x ?? 0));
    });
    assert.equal(last.kind, "exit", JSON.stringify({ tracker, last }));
    assert.equal(last.step, GUIDE_ROUTES[level].length);
    assert.ok(turns > 0);
  });
test("guide moves from walking to jump, then turns to the other axis at the actual corner", () => {
  const g = newGame(1),
    p = g.players[0],
    tracker = newGuideTracker();
  let guide = guideFor(g, 0, tracker);
  assert.equal(guide.direction, "right");
  Object.assign(p, { x: 3.6 });
  guide = guideFor(g, 0, tracker);
  assert.equal(guide.kind, "jump");
  assert.ok(guide.keys.includes("空格"));
  Object.assign(p, { x: 11, checkpoint: 0 });
  guide = guideFor(g, 0, tracker);
  assert.equal(guide.direction, "turn");
  assert.deepEqual(guide.keys, ["Q"]);
  g.view = 1;
  guide = guideFor(g, 0, tracker);
  assert.equal(guide.direction, "right");
  assert.notEqual(guide.lesson, "turn");
});
test("death rewinds the guide to the player’s rack, and a new game starts fresh", () => {
  const g = newGame(1, 4),
    p = g.players[0],
    tracker = newGuideTracker();
  p.checkpoint = 1;
  Object.assign(p, { x: 17, z: 6, y: 2.3 });
  guideFor(g, 0, tracker);
  p.y = -8;
  stepGame(g, {});
  const guide = guideFor(g, 0, tracker);
  assert.ok(guide.step <= 9);
  assert.notEqual(guide.kind, "exit");
  const fresh = newGame(1, 4, "new");
  assert.equal(guideFor(fresh, 0, tracker).step, 1);
});
for (const mode of [2, 3, 6] as const)
  test(`${mode} players see different instructions for the bridge maker and receiver`, () => {
    const g = newGame(mode, 1),
      c = CROSSINGS[1];
    Object.assign(g.players[0], bankPoint(c, c.near));
    stepGame(g, { 0: { ...idleInput(), fold: true } });
    const holder = guideFor(g, 0, newGuideTracker());
    assert.equal(holder.lesson, "bridge");
    assert.match(words(holder.body, "en"), /friend must walk/);
    Object.assign(g.players[1], bankPoint(c, c.near));
    const receiver = guideFor(g, 1, newGuideTracker());
    assert.equal(receiver.lesson, "bridge");
    assert.match(words(receiver.title, "en"), /Walk across/);
  });
test("the guide explains automatic solo bridging and heat warnings without changing the game", () => {
  const g = newGame(1, 1);
  Object.assign(g.players[0], bankPoint(CROSSINGS[1], -1));
  stepGame(g, { 0: { ...idleInput(), fold: true } });
  g.players[0].heat = 70;
  const before = JSON.stringify(g),
    guide = guideFor(g, 0, newGuideTracker());
  assert.match(words(guide.body, "en"), /Solo/);
  assert.match(words(guide.warning!, "en"), /Leave the fire/);
  assert.equal(JSON.stringify(g), before);
});

test("every mandatory key is included in the guide, including ferry pickups", () => {
  for (let level = 0; level < LEVELS.length; level++) {
    const ids = GUIDE_ROUTES[level].flatMap((s) =>
      s.kind === "key"
        ? [s.id]
        : s.requiredKey !== undefined
          ? [s.requiredKey]
          : [],
    );
    assert.deepEqual(
      [...new Set(ids)].sort(),
      LEVELS[level].keys.map((_, i) => i),
    );
  }
});
test("the ferry cue waits when out of reach and makes the rider collect its key before jumping", () => {
  const g = newGame(1, 5),
    p = g.players[0],
    tracker = newGuideTracker();
  Object.assign(p, { x: 3.8 });
  g.motionTime = 1.5;
  let guide = guideFor(g, 0, tracker);
  assert.equal(guide.kind, "ferry");
  assert.equal(guide.direction, "stay");
  assert.deepEqual(guide.keys, []);
  Object.assign(p, { x: 10, y: 0, support: 2 });
  guide = guideFor(g, 0, tracker);
  assert.match(words(guide.title, "en"), /key first/);
  assert.equal(guide.direction, "stay");
  g.keys = [0];
  guide = guideFor(g, 0, tracker);
  assert.ok(guide.keys.includes("空格"));
});
test("players already holding the gate pads are not told to swap positions", () => {
  const g = newGame(2, 4),
    p = g.players[0],
    tracker = newGuideTracker();
  g.keys = [0, 1, 2];
  p.checkpoint = 2;
  Object.assign(p, LEVELS[4].pads[1]);
  const guide = guideFor(g, 0, tracker);
  assert.equal(guide.kind, "pads");
  assert.equal(guide.direction, "stay");
});

test("bridge hints teach alignment before holding Shift, and paper shelter is prompted only on a gate pad", () => {
  const g = newGame(1, 1),
    p = g.players[0],
    t = newGuideTracker();
  p.x = 2.9;
  let cue = guideFor(g, 0, t);
  assert.equal(cue.kind, "bridge");
  assert.ok(!cue.keys.includes("Shift"));
  assert.equal(cue.direction, "right");
  p.x = 3.4;
  cue = guideFor(g, 0, t);
  assert.deepEqual(cue.keys, ["Shift"]);
  const gate = newGame(1, 4);
  gate.players[0].checkpoint = 2;
  gate.keys = [0, 1, 2];
  Object.assign(gate.players[0], { x: 26, y: 0, z: -2 });
  assert.ok(!guideFor(gate, 0, newGuideTracker()).keys.includes("S"));
});
test("an arrived player waits rather than being told to retrieve a teammate’s dropped key", () => {
  const g = newGame(2, 4);
  g.players[0].arrived = true;
  g.players[0].checkpoint = 2;
  const cue = guideFor(g, 0, newGuideTracker());
  assert.equal(cue.kind, "exit");
  assert.equal(cue.target, undefined);
  assert.deepEqual(cue.keys, []);
});
