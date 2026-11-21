import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, MODES, type Game } from "../src/game";
import { completeLevel } from "./journey";
import { completeStormLevel } from "./storm-journeys";

for (let level = 0; level < LEVELS.length; level++)
  for (const mode of level < 9 ? ([1] as const) : MODES)
    test(`hard rain: chapter ${level + 1}, ${mode} player${mode === 1 ? "" : "s"} completes with real controls and no deaths`, () => {
      let maxWetness = 0;
      const observe = (game: Game) => {
        maxWetness = Math.max(
          maxWetness,
          ...game.players.map((p) => p.wetness),
        );
      };
      const game =
        level < 9
          ? completeLevel(level, observe, undefined, "hard")
          : completeStormLevel(
              level,
              observe,
              undefined,
              0,
              mode,
              undefined,
              "hard",
            );
      assert.equal(game.rainDifficulty, "hard");
      assert.equal(game.status, "won");
      assert.equal(game.keys.length, LEVELS[level].keys.length);
      assert.ok(game.players.every((p) => p.arrived && p.deaths === 0));
      assert.ok(
        maxWetness < 100,
        "waiting uses paper cover and campfires before the crane soaks through",
      );
      // The original introductory journeys focus on teaching controls; the
      // complete mechanism routes cover every star from chapter 10 onward.
      if (level >= 9)
        assert.equal(game.stars.length, LEVELS[level].stars.length);
    });
