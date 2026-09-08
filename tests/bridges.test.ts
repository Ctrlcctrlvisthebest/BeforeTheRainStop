import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  stepGame,
  idleInput,
  MAX_FOLDS,
  type Game,
  type Input,
} from "../src/game";
import { CROSSINGS, bankPoint } from "../src/bridges";
function controls(g: Game) {
  const inputs: Record<number, Input> = Object.fromEntries(
    g.players.map((p) => [p.id, idleInput()]),
  );
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) stepGame(g, inputs);
  };
  const move = (id: number, target: number) => {
    const p = g.players[id],
      axis = g.view === 0 ? "x" : "z",
      dir = g.view === 0 ? 1 : -1;
    for (let n = 0; n < 200; n++) {
      const error = target - p[axis];
      if (Math.abs(error) < 0.13 && Math.abs(p.vx) + Math.abs(p.vz) < 0.4) {
        inputs[id] = idleInput();
        return;
      }
      inputs[id] = {
        ...idleInput(),
        axis:
          Math.abs(error) < 0.12
            ? 0
            : Math.sign(error) * dir * Math.min(1, Math.abs(error) * 2),
      };
      tick();
    }
    assert.fail(`player ${id} cannot reach ${target}: ${JSON.stringify(p)}`);
  };
  return { inputs, tick, move };
}
for (const level of Object.keys(CROSSINGS).map(Number)) {
  test(`chapter ${level + 1}: the far bridge plate works for any arrival route and needs no bridge holder`, () => {
    const c = CROSSINGS[level];
    const far = bankPoint(c, c.near === -1 ? 1 : -1);
    for (const mode of [1, 2, 3, 6] as const) {
      const g = newGame(mode, level);
      Object.assign(g.players[mode - 1], far);
      const inputs = Object.fromEntries(
        g.players.map((p) => [p.id, { ...idleInput(), shelter: true }]),
      );
      for (let i = 0; i < 60; i++) stepGame(g, inputs);
      assert.equal(
        g.bridgeLatched,
        false,
        "still requires a visible two-second hold",
      );
      for (let i = 0; i < 65; i++) stepGame(g, inputs);
      assert.equal(g.bridgeLatched, true);
      assert.ok(g.players.every((p) => !p.bridgeDock));
    }
  });
  test(`chapter ${level + 1}: low corridor defeats running, jumping and held gliding across the gap`, () => {
    const c = CROSSINGS[level],
      near = bankPoint(c, c.near),
      far = bankPoint(c, c.near === -1 ? 1 : -1);
    for (const jumpStart of [0, 0.25, 0.5, 0.8, 1.2])
      for (const held of [false, true]) {
        const g = newGame(1, level),
          p = g.players[0];
        g.view = c.axis === "x" ? 0 : 1;
        Object.assign(p, near, { [c.axis]: near[c.axis] + c.near * jumpStart });
        let crossed = false;
        for (let n = 0; n < 100; n++) {
          stepGame(g, {
            0: {
              ...idleInput(),
              axis: -c.near * (g.view === 0 ? 1 : -1),
              jump: held ? n >= 1 : n === 1,
            },
          });
          if (
            p.deaths === 0 &&
            (p[c.axis] - far[c.axis]) * -c.near > -0.35 &&
            p.y >= c.y - 0.05
          )
            crossed = true;
        }
        assert.equal(crossed, false, `jump from ${jumpStart}, glide ${held}`);
        assert.equal(g.bridgeLatched, false);
      }
  });
  test(`chapter ${level + 1}: solo bridge needs an uninterrupted hold and costs one fold`, () => {
    const g = newGame(1, level),
      p = g.players[0],
      c = CROSSINGS[level];
    Object.assign(p, bankPoint(c, c.near));
    g.view = c.axis === "x" ? 0 : 1;
    const { inputs, tick, move } = controls(g);
    inputs[0].fold = true;
    tick(65);
    assert.equal(g.bridgeLatched, false);
    assert.ok(p.bridgeDock);
    assert.equal(p.foldsLeft, MAX_FOLDS - 1);
    inputs[0].fold = false;
    tick();
    assert.equal(g.bridgeCharge, 0);
    assert.equal(p.bridgeDock, false);
    assert.ok(Math.abs(p[c.axis] - bankPoint(c, c.near)[c.axis]) < 0.01);
    inputs[0].fold = true;
    tick(125);
    assert.equal(g.bridgeLatched, true);
    inputs[0].fold = false;
    tick(8);
    move(0, bankPoint(c, c.near === -1 ? 1 : -1)[c.axis]);
    assert.equal(p.deaths, 0);
    assert.equal(p.foldsLeft, MAX_FOLDS - 2);
  });
  for (const mode of [2, 3, 6] as const)
    test(`chapter ${level + 1}: ${mode} cranes cross and recover the bridge holder`, () => {
      const g = newGame(mode, level),
        c = CROSSINGS[level];
      if (level === 3) {
        g.view = 1;
        g.players.forEach((p, i) =>
          Object.assign(p, { x: 11, y: 0, z: -2.3 + i * 0.28 }),
        );
      }
      if (level === 6)
        g.players.forEach((p, i) =>
          Object.assign(p, { x: 13.1 - i * 0.1, y: 0, z: 6 }),
        );
      if (level === 10)
        g.players.forEach((p, i) =>
          Object.assign(p, { x: 11.5 - i * 0.1, y: 0, z: 6 }),
        );
      if (level >= 12) {
        g.view = c.axis === "x" ? 0 : 1;
        const near = bankPoint(c, c.near);
        g.players.forEach((p, i) =>
          Object.assign(p, near, { [c.axis]: near[c.axis] + i * 0.2 * c.near }),
        );
      }
      const { inputs, tick, move } = controls(g);
      move(0, bankPoint(c, c.near)[c.axis]);
      inputs[0].fold = true;
      tick(180);
      assert.equal(
        g.bridgeLatched,
        false,
        "multiplayer cannot use the solo timer",
      );
      assert.equal(g.players[0].foldsLeft, MAX_FOLDS - 1);
      const far = bankPoint(c, c.near === -1 ? 1 : -1);
      move(1, far[c.axis]);
      tick(125);
      assert.equal(g.bridgeLatched, true);
      for (let i = 2; i < mode; i++) move(i, far[c.axis]);
      inputs[0] = idleInput();
      tick(8);
      move(0, far[c.axis]);
      assert.ok(
        g.players.every(
          (p) => p.deaths === 0 && Math.abs(p[c.axis] - far[c.axis]) < 0.15,
        ),
      );
    });
}
test("changing view does not rotate a docked paper bridge", () => {
  const g = newGame(2, 1),
    { inputs, tick } = controls(g);
  Object.assign(g.players[0], { x: 3.4 });
  inputs[0].fold = true;
  tick();
  Object.assign(g.players[1], { x: 7 });
  tick(30);
  assert.equal(g.bridgeLatched, false);
  inputs[1].turn = true;
  tick(60);
  assert.equal(g.view, 1);
  assert.equal(g.players[0].bridgeAxis, "x");
  assert.equal(g.players[0].x, 5.2);
  assert.equal(g.players[0].deaths, 0);
});
test("unrepaired crossing does not lock the final gate plates", () => {
  const g = newGame(1, 1),
    p = g.players[0];
  Object.assign(p, { x: 16, y: 0, z: -7 });
  const { inputs, tick } = controls(g);
  inputs[0].shelter = true;
  tick(250);
  assert.equal(g.gateOpen, true);
  assert.equal(g.gateCharge, 4);
  assert.equal(g.bridgeLatched, false);
});
test("older room snapshots acquire bridge state without interrupting play", () => {
  const g = newGame(1, 1);
  for (const k of ["bridgeLatched", "bridgeCharge"]) delete (g as any)[k];
  for (const k of ["bridgeDock", "bridgeFrom", "bridgeAxis"])
    delete (g.players[0] as any)[k];
  stepGame(g, {});
  assert.equal(g.bridgeLatched, false);
  assert.equal(g.players[0].bridgeDock, false);
});
