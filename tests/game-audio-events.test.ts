import test from "node:test";
import assert from "node:assert/strict";
import { newGame, LEVELS } from "../src/game";
import { createGameAudioEvents } from "../src/game-audio-events";

test("mechanism cues occur once per transition, including between cloned network snapshots", () => {
  const events = createGameAudioEvents();
  const game = newGame(1, 0, "run-a");
  assert.deepEqual(events.observe(game), []);
  game.bridgeLatched = true;
  assert.deepEqual(events.observe(game), ["bridge-ready"]);
  assert.deepEqual(events.observe(structuredClone(game)), []);
  game.gateOpen = true;
  assert.deepEqual(events.observe(game), ["gate-open"]);
  game.keys = LEVELS[0].keys.map((_, i) => i);
  assert.deepEqual(events.observe(game), ["exit-open"]);
  assert.deepEqual(events.observe(game), []);
});

test("rejoining an open level and changing run or level does not replay past events", () => {
  const events = createGameAudioEvents();
  const game = newGame(1, 0, "run-a");
  game.bridgeLatched = game.gateOpen = true;
  game.keys = LEVELS[0].keys.map((_, i) => i);
  assert.deepEqual(events.observe(game), []);
  game.id = "run-b";
  assert.deepEqual(events.observe(game), []);
  game.level = 1;
  assert.deepEqual(events.observe(game), []);
});
