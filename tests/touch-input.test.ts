import test from "node:test";
import assert from "node:assert/strict";
import { TouchInput, mergeInput } from "../src/touch-input";
import { idleInput, newGame, stepGame } from "../src/game";
import { touchCopy } from "../src/mobile";

test("a second finger can jump while the first keeps moving", () => {
  const input = new TouchInput();
  const g = newGame(1);
  input.press(1, "axis", 1, 0);
  input.press(2, "jump", true, 0);
  for (let frame = 0; frame < 12; frame++)
    stepGame(g, { 0: input.read((frame * 1000) / 60) });
  assert.ok(g.players[0].x > -1);
  assert.ok(g.players[0].y > 0);
  input.release(2, 220);
  assert.equal(input.read(230).jump, false);
  assert.equal(input.read(230).axis, 1);
});

test("releasing one direction keeps the other finger's direction", () => {
  const input = new TouchInput();
  input.press(1, "axis", -1, 0);
  input.press(2, "axis", 1, 5);
  assert.equal(input.read(10).axis, 0);
  input.release(1, 20);
  assert.equal(input.read(21).axis, 1);
  input.cancel(2);
  assert.equal(input.read(22).axis, 0);
});

test("a tap between simulation ticks turns the world exactly once", () => {
  const input = new TouchInput();
  const g = newGame(1);
  input.press(1, "turn", true, 1);
  input.release(1, 3);
  input.cancel(1); // browser's normal lostpointercapture after pointerup
  for (let frame = 1; frame <= 20; frame++)
    stepGame(g, { 0: input.read((frame * 1000) / 60) });
  assert.equal(g.flips, 1);
  assert.equal(input.read(400).turn, false);
});

test("cancelled touches do not trigger a buffered action", () => {
  const input = new TouchInput();
  input.press(1, "jump", true, 0);
  input.cancel(1);
  assert.deepEqual(input.read(5), idleInput());
});

test("held paper transformations release immediately", () => {
  for (const field of ["fold", "shelter", "repair"] as const) {
    const input = new TouchInput();
    input.press(1, field, true, 1);
    assert.equal(input.read(2)[field], true);
    input.release(1, 3);
    assert.equal(input.read(4)[field], false);
  }
});

test("clearing on menu, blur or visibility loss cancels holds and pulses", () => {
  const input = new TouchInput();
  input.press(1, "axis", 1, 0);
  input.press(2, "reset", true, 0);
  input.release(2, 1);
  input.clear();
  assert.deepEqual(input.read(2), idleInput());
});

test("hardware keyboard and touch inputs combine without losing a held jump", () => {
  const keyboard = { ...idleInput(), axis: -1, jump: true };
  const touch = { ...idleInput(), axis: 1, repair: true };
  const result = mergeInput(keyboard, touch);
  assert.equal(result.axis, 0);
  assert.equal(result.jump, true);
  assert.equal(result.repair, true);
  assert.equal(mergeInput(idleInput(), touch).axis, 1);
});

test("phone instructions use the actual buttons without confusing Shift and S", () => {
  assert.equal(
    touchCopy("按住 Shift，S / ↓ 挡雨，Q / E 转动，F 修补，R 返回", "zh"),
    "按住 「纸桥」，「挡雨」 挡雨，「转面」 转动，「修补」 修补，「回存档」 返回",
  );
  assert.equal(
    touchCopy("Hold Shift, S / Down, Q / E, SPACE, F, R", "en"),
    "Hold Bridge, Shelter, Turn, Jump, Mend, Return",
  );
});
