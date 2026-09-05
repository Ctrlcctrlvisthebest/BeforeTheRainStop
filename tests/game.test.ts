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
    assert.equal(g.gateOpen, false);
    if (mode > 1) {
      Object.assign(g.players[1], { x: 19, y: 0, z: -7 });
    }
    const guarding = Object.fromEntries(
      g.players.map((p) => [p.id, { ...idleInput(), shelter: true }]),
    );
    for (let n = 0; n < 245; n++) stepGame(g, guarding);
    assert.equal(g.gateOpen, true);
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

test("rain accumulates wetness, roofs and dry areas restore paper", () => {
  const g = newGame(1);
  Object.assign(g.players[0], { x: 19, y: 0, z: -7 });
  tick(g, {}, 90);
  assert.ok(g.players[0].wetness > 20);
  Object.assign(g.players[0], { x: 16, wetness: 75 });
  tick(g, {}, 90);
  assert.equal(g.players[0].rainCover, "roof");
  assert.ok(g.players[0].wetness < 40);
  Object.assign(g.players[0], { x: 1, y: 0, z: 0 });
  tick(g, {}, 120);
  assert.equal(g.players[0].wetness, 0);
});
test("S holds position and reduces own rain while protecting a nearby teammate", () => {
  const g = newGame(2);
  Object.assign(g.players[0], { x: 19, y: 0, z: -7 });
  Object.assign(g.players[1], { x: 20.5, y: 0, z: -7, wetness: 40 });
  const exposed = structuredClone(g);
  for (let n = 0; n < 90; n++) {
    stepGame(g, { 0: { ...idleInput(), shelter: true, axis: 1, jump: true } });
    stepGame(exposed, {});
  }
  assert.equal(g.players[0].x, 19);
  assert.equal(g.players[0].y, 0);
  assert.ok(g.players[0].wetness > 0);
  assert.ok(g.players[0].wetness < exposed.players[0].wetness * 0.35);
  assert.equal(g.players[1].rainCover, "ally");
  assert.ok(g.players[1].wetness < 30);
});
test("two cranes can mutually shelter, in either camera view and independent of slot order", () => {
  for (const view of [0, 1] as const) {
    const g = newGame(2);
    g.view = view;
    Object.assign(g.players[0], { x: 19, y: 0, z: -7, wetness: 50 });
    Object.assign(g.players[1], { x: 20.5, y: 0, z: -7, wetness: 50 });
    for (let n = 0; n < 90; n++)
      stepGame(g, {
        0: { ...idleInput(), shelter: true },
        1: { ...idleInput(), shelter: true },
      });
    assert.ok(g.players.every((p) => p.rainCover === "ally" && p.wetness < 36));
    assert.equal(g.players[0].wetness, g.players[1].wetness);
  }
});
test("protection has limited range and stops when released", () => {
  const g = newGame(2);
  Object.assign(g.players[0], { x: 19, y: 0, z: -7 });
  Object.assign(g.players[1], { x: 22, y: 0, z: -7 });
  stepGame(g, { 0: { ...idleInput(), shelter: true } });
  assert.equal(g.players[1].rainCover, "rain");
  Object.assign(g.players[1], { x: 19.8 });
  stepGame(g, { 0: { ...idleInput(), shelter: true } });
  assert.equal(g.players[1].rainCover, "ally");
  stepGame(g, {});
  assert.equal(g.players[1].rainCover, "rain");
});
test("soaking returns only the affected crane to its dry checkpoint", () => {
  const g = newGame(2);
  g.keys = [0];
  Object.assign(g.players[0], {
    x: 19,
    y: 0,
    z: -7,
    wetness: 99.99,
    checkpoint: 1,
  });
  const other = { ...g.players[1] };
  stepGame(g, {});
  assert.equal(g.players[0].deaths, 1);
  assert.equal(g.players[0].wetness, 0);
  assert.equal(g.players[0].x, 16);
  assert.equal(g.players[1].x, other.x);
  assert.deepEqual(g.keys, [0]);
});
test("new rain fields and optional shelter input preserve existing room saves", () => {
  const g = newGame(1);
  delete (g.players[0] as any).wetness;
  delete (g.players[0] as any).rainCover;
  delete (g.players[0] as any).sheltering;
  delete (g as any).gateCharge;
  tick(g);
  assert.equal(g.players[0].wetness, 0);
  assert.equal(g.gateCharge, 0);
  const input: any = idleInput();
  delete input.shelter;
  assert.equal(cleanInput(input)?.shelter, false);
  assert.equal(cleanInput({ ...idleInput(), shelter: "yes" }), null);
});
test("pressure pads need continuous shelter time; stepping away cancels charge", () => {
  const g = newGame(1, 1);
  Object.assign(g.players[0], { x: 16, y: 0, z: -7 });
  tick(g, { shelter: true }, 120);
  assert.ok(g.gateCharge > 1.9 && g.gateCharge < 2.1);
  assert.equal(g.gateOpen, false);
  Object.assign(g.players[0], { x: 17.5 });
  tick(g);
  assert.equal(g.gateCharge, 0);
  Object.assign(g.players[0], { x: 16 });
  tick(g, { shelter: true }, 245);
  assert.equal(g.gateOpen, true);
});

test("unfolding spends durability once; holding, wingbeats and release spend none", () => {
  const g = newGame(1);
  tick(g, { shelter: true }, 240);
  assert.equal(g.players[0].foldsLeft, 5);
  tick(g, {}, 5);
  assert.equal(g.players[0].foldsLeft, 5);
  tick(g, { fold: true }, 60);
  assert.equal(g.players[0].foldsLeft, 4);
  tick(g, { shelter: true });
  assert.equal(g.players[0].foldsLeft, 3);
  tick(g, {}, 5);
  tick(g, { jump: true }, 90);
  assert.equal(g.players[0].foldsLeft, 3);
});
test("wet paper costs two folds and an unaffordable change is rejected", () => {
  const g = newGame(1),
    p = g.players[0];
  p.wetness = 65;
  tick(g, { shelter: true });
  assert.equal(p.foldsLeft, 4);
  tick(g);
  Object.assign(p, { wetness: 65, foldsLeft: 1 });
  tick(g, { shelter: true });
  assert.equal(p.sheltering, false);
  assert.equal(p.foldBlocked, true);
  assert.equal(p.foldsLeft, 1);
  p.wetness = 0;
  tick(g, { shelter: true });
  assert.equal(p.sheltering, true);
  assert.equal(p.foldsLeft, 0);
  tick(g, { shelter: true }, 60);
  assert.equal(p.sheltering, true);
});
test("worn paper cannot unfold again but can still move and jump", () => {
  const g = newGame(1),
    p = g.players[0];
  for (let n = 0; n < 6; n++) {
    tick(g, { shelter: true });
    tick(g);
  }
  tick(g, { fold: true });
  assert.equal(p.folded, false);
  assert.equal(p.foldBlocked, true);
  tick(g, { axis: 1, jump: true }, 20);
  assert.ok(p.x > -0.5);
  assert.ok(p.y > 1);
  assert.equal(p.foldsLeft, 0);
});
test("returns preserve wear; a new wishing checkpoint repairs only once", () => {
  const g = newGame(1),
    p = g.players[0];
  p.foldsLeft = 1;
  tick(g, { reset: true });
  assert.equal(p.foldsLeft, 1);
  Object.assign(p, { x: 10, y: 0, z: 0, grounded: true });
  tick(g);
  assert.equal(p.checkpoint, 0);
  assert.equal(p.foldsLeft, 6);
  tick(g, { shelter: true });
  tick(g, {}, 120);
  assert.equal(p.foldsLeft, 5);
  Object.assign(p, { y: -8 });
  tick(g);
  assert.equal(p.foldsLeft, 5);
});
test("repair needs two uninterrupted seconds at a rack and cannot be done remotely", () => {
  const g = newGame(1),
    p = g.players[0];
  p.foldsLeft = 0;
  p.wetness = 50;
  tick(g, { repair: true }, 90);
  assert.equal(p.foldsLeft, 0);
  assert.ok(p.repairProgress > 1.4);
  tick(g, { repair: true, axis: 1 });
  assert.equal(p.repairProgress, 0);
  tick(g, { repair: true }, 125);
  assert.equal(p.foldsLeft, 6);
  assert.equal(p.wetness, 0);
  Object.assign(p, { x: 3.8, foldsLeft: 0 });
  tick(g, { repair: true }, 180);
  assert.equal(p.foldsLeft, 0);
  assert.equal(p.repairProgress, 0);
  Object.assign(p, { x: -1, grounded: true });
  tick(g, { repair: true, shelter: true }, 130);
  assert.equal(p.foldsLeft, 0);
  assert.equal(p.repairProgress, 0);
});
test("old saves get durability and old clients can omit repair", () => {
  const g = newGame(1),
    p = g.players[0] as any;
  delete p.foldsLeft;
  delete p.repairProgress;
  delete p.foldBlocked;
  tick(g);
  assert.equal(p.foldsLeft, 6);
  assert.equal(p.repairProgress, 0);
  const old: any = idleInput();
  delete old.repair;
  assert.equal(cleanInput(old)?.repair, false);
  assert.equal(cleanInput({ ...idleInput(), repair: 1 }), null);
});
