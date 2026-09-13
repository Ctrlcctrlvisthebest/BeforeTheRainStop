import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../src/game";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { interactiveModules } from "../src/map-rules";
import { completeStormLevel } from "./storm-journeys";

for (let level = 27; level < 40; level++) {
  const map = CHALLENGE_MAPS[level - 8];
  test(`expert chapter ${level + 1}: sustained jumping and at least three working mechanisms`, () => {
    assert.ok(interactiveModules(map).length >= 3);
    assert.ok(map.route.filter((s) => s.kind === "jump").length >= 6);
    assert.throws(
      () =>
        completeStormLevel(level, undefined, (_g, input) => {
          input.jump = false;
        }),
      new RegExp(`chapter ${level + 1}`),
    );
  });
  test(`expert chapter ${level + 1}: all players and departure phases have a full-star route`, () => {
    for (const mode of [1, 2, 3, 6] as const)
      for (const delay of [0, 90, 210, 330]) {
        const game = completeStormLevel(
          level,
          undefined,
          undefined,
          delay,
          mode,
        );
        assert.equal(game.status, "won");
        assert.equal(game.stars.length, LEVELS[level].stars.length);
        assert.ok(game.players.every((p) => p.deaths === 0 && p.arrived));
      }
  });
  if (map.crossing)
    test(`expert chapter ${level + 1}: the low passage requires a paper bridge`, () => {
      assert.throws(() =>
        completeStormLevel(level, undefined, (_g, input) => {
          input.fold = false;
        }),
      );
    });
}
