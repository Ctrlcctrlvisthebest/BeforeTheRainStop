import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, MAX_FOLDS, newGame, idleInput, stepGame } from "../src/game";
import { CROSSINGS, bankPoint } from "../src/bridges";
import { bridgeSocketState, mechanismFeedback } from "../src/mechanism-state";

test("bridge alignment matches both banks in every map and rejects wrong lane, height, view and airborne cranes", () => {
  for (const [index, crossing] of Object.entries(CROSSINGS)) {
    for (const side of [-1, 1] as const) {
      const g = newGame(1, Number(index)),
        p = g.players[0];
      const bank = bankPoint(crossing, side),
        other = crossing.axis === "x" ? "z" : "x";
      g.view = crossing.axis === "x" ? 0 : 1;
      Object.assign(p, bank);
      assert.equal(bridgeSocketState(g, side), "aligned");
      p[other] += 0.6;
      assert.equal(bridgeSocketState(g, side), "idle");
      Object.assign(p, bank, { y: bank.y + 0.4 });
      assert.equal(bridgeSocketState(g, side), "idle");
      Object.assign(p, bank, { grounded: false });
      assert.equal(bridgeSocketState(g, side), "idle");
      p.grounded = true;
      g.view = g.view === 0 ? 1 : 0;
      assert.equal(bridgeSocketState(g, side), "idle");
      g.view = g.view === 0 ? 1 : 0;
      p.arrived = true;
      assert.equal(bridgeSocketState(g, side), "idle");
    }
  }
});

test("solo bridge shows progress only while holding and hides on interruption or completion", () => {
  const g = newGame(1, 1),
    c = CROSSINGS[1],
    p = g.players[0];
  Object.assign(p, bankPoint(c, c.near));
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
  for (let i = 0; i < 60; i++)
    stepGame(g, { 0: { ...idleInput(), fold: true } });
  assert.equal(bridgeSocketState(g, c.near), "holding");
  assert.ok(
    mechanismFeedback(g, 0, "zh").find((x) => x.id === "bridge")!.progress >
      0.4,
  );
  stepGame(g, { 0: idleInput() });
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
  for (let i = 0; i < 125; i++)
    stepGame(g, { 0: { ...idleInput(), fold: true } });
  assert.equal(g.bridgeLatched, true);
  assert.equal(bridgeSocketState(g, c.near), "complete");
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
});

test("multiplayer bridge explains waiting, then counts a far plate reached by any route", () => {
  const g = newGame(2, 1),
    c = CROSSINGS[1];
  Object.assign(g.players[0], bankPoint(c, c.near));
  stepGame(g, { 0: { ...idleInput(), fold: true } });
  const waiting = mechanismFeedback(g, 0, "zh").find((x) => x.id === "bridge")!;
  assert.match(waiting.detail, /同伴踩对岸/);
  assert.equal(waiting.progress, 0);
  // Restore the holder and reach the far side directly: there is no bridge prerequisite.
  stepGame(g, {});
  const far = bankPoint(c, c.near === -1 ? 1 : -1);
  Object.assign(g.players[1], far);
  for (let i = 0; i < 60; i++) stepGame(g, {});
  const active = mechanismFeedback(g, 1, "en").find((x) => x.id === "bridge")!;
  assert.deepEqual(active.anchor, far);
  assert.match(active.detail, /Keep holding/);
  assert.ok(active.progress > 0.4);
  assert.ok(g.players.every((p) => !p.bridgeDock));
});

test("gate feedback appears on the held plate, explains the missing teammate, resets and disappears after opening", () => {
  const g = newGame(2, 1),
    pads = LEVELS[1].pads;
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
  Object.assign(g.players[0], pads[0]);
  stepGame(g, {});
  let card = mechanismFeedback(g, 0, "zh").find((x) => x.id === "gate")!;
  assert.deepEqual(card.anchor, pads[0]);
  assert.match(card.detail, /还差 1 人/);
  assert.equal(card.progress, 0);
  Object.assign(g.players[1], pads[1]);
  for (let i = 0; i < 60; i++) stepGame(g, {});
  card = mechanismFeedback(g, 1, "en").find((x) => x.id === "gate")!;
  assert.deepEqual(card.anchor, pads[1]);
  assert.ok(card.progress > 0.2);
  g.players[1].x += 2;
  stepGame(g, {});
  assert.equal(
    mechanismFeedback(g, 0, "zh").find((x) => x.id === "gate")!.progress,
    0,
  );
  g.players[0].x += 2;
  stepGame(g, {});
  assert.equal(
    mechanismFeedback(g, 0, "zh").some((x) => x.id === "gate"),
    false,
  );
  g.players.forEach((p, i) => Object.assign(p, pads[i]));
  for (let i = 0; i < 241; i++)
    stepGame(g, {
      0: { ...idleInput(), shelter: true },
      1: { ...idleInput(), shelter: true },
    });
  assert.equal(g.gateOpen, true);
  assert.equal(
    mechanismFeedback(g, 0, "zh").some((x) => x.id === "gate"),
    false,
  );
});

test("repair progress is local to the rack and vanishes after releasing or finishing", () => {
  const g = newGame(1),
    p = g.players[0];
  p.foldsLeft = 3;
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
  for (let i = 0; i < 40; i++)
    stepGame(g, { 0: { ...idleInput(), repair: true } });
  const card = mechanismFeedback(g, 0, "zh")[0];
  assert.equal(card.id, "repair-0");
  assert.deepEqual(card.anchor, LEVELS[0].spawn);
  assert.ok(card.progress > 0.3);
  stepGame(g, {});
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
  for (let i = 0; i < 125; i++)
    stepGame(g, { 0: { ...idleInput(), repair: true } });
  assert.equal(p.foldsLeft, MAX_FOLDS);
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
});

test("six simultaneous repairs at one rack share the viewer's card; distant interactions stay hidden", () => {
  const g = newGame(6);
  g.players.forEach((p) =>
    Object.assign(p, LEVELS[0].spawn, {
      foldsLeft: 2,
      repairProgress: 0.4 + p.id * 0.1,
    }),
  );
  const cards = mechanismFeedback(g, 5, "en");
  assert.equal(cards.length, 1);
  assert.match(cards[0].title, /6/);
  assert.equal(cards[0].progress, 0.45);
  g.players[5].x += 20;
  assert.deepEqual(mechanismFeedback(g, 5, "en"), []);
  g.status = "won";
  assert.deepEqual(mechanismFeedback(g, 0, "zh"), []);
});
