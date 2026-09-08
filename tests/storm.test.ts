import { completeStormLevel } from "./storm-journeys";
import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, MODES, newGame, idleInput, stepGame } from "../src/game";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { GUIDE_ROUTES } from "../src/guide";
import { validateMap } from "../src/map-format";
import { translate } from "../src/i18n";
import { command, joinRoom, makeRoom } from "../src/room";

for (let level = 12; level < 17; level++) {
  test(`chapter ${level + 1}: valid bilingual editor export and safe six-player spawn`, () => {
    const map = CHALLENGE_MAPS[level - 8];
    assert.deepEqual(validateMap(map).errors, []);
    for (const text of [
      map.level.name,
      map.level.sub,
      map.level.hint,
      ...map.level.signs.map((s) => s.text),
    ]) {
      assert.ok(text);
      assert.notEqual(
        translate("en", text),
        text,
        `missing translation: ${text}`,
      );
    }
    for (const mode of MODES) {
      const g = newGame(mode, level);
      for (let frame = 0; frame < 600; frame++) stepGame(g, {});
      assert.ok(
        g.players.every((p) => p.deaths === 0 && p.grounded && p.heat === 0),
      );
    }
  });
  test(`chapter ${level + 1}: changing departure time preserves a death-free route`, () => {
    for (const delay of [90, 210, 330]) {
      const g = completeStormLevel(level, undefined, undefined, delay);
      assert.equal(g.status, "won");
      assert.equal(g.players[0].deaths, 0);
    }
  });
  test(`chapter ${level + 1}: each ferry is essential to its long gap`, () => {
    const l = LEVELS[level];
    for (const [index, step] of GUIDE_ROUTES[level].entries()) {
      if (step.kind !== "ferry") continue;
      const from = GUIDE_ROUTES[level][index - 1].target;
      const axis = step.view === 0 ? "x" : "z",
        other = axis === "x" ? "z" : "x";
      const sign = Math.sign(step.target[axis] - from[axis]);
      const original = l.platforms;
      // Isolate a missed ferry: the bird has no moving deck to catch its fall.
      l.platforms = original.filter((_, i) => i !== step.id);
      try {
        for (const lead of [0, 0.3, 0.6]) {
          const g = newGame(1, level),
            p = g.players[0];
          g.view = step.view;
          Object.assign(p, from, { [axis]: from[axis] + lead * sign });
          let reached = false;
          for (let frame = 0; frame < 170 && p.deaths === 0; frame++) {
            stepGame(g, {
              0: {
                ...idleInput(),
                axis: sign * (step.view === 0 ? 1 : -1),
                jump: true,
              },
            });
            if (
              p.deaths === 0 &&
              (p[axis] - step.target[axis]) * sign > -0.6 &&
              Math.abs(p[other] - step.target[other]) < 0.6 &&
              p.y >= step.target.y - 0.1
            )
              reached = true;
          }
          assert.equal(
            reached,
            false,
            `ferry ${step.id}, take-off offset ${lead}`,
          );
        }
      } finally {
        l.platforms = original;
      }
    }
  });
}

test("chapter 12 advances into the five new chapters; only chapter 17 wraps to the start", () => {
  for (const level of [11, 12, 13, 14, 15, 16]) {
    const room = makeRoom("ABCDEFGH", 2, level, "A", "a", 0);
    joinRoom(room, "B", "b", 0);
    room.phase = "game";
    room.game = newGame(2, level, "finished");
    room.game.status = "won";
    const first = command(
      room,
      "a",
      { type: "restart", gameId: "finished", next: true },
      1,
      "next",
    );
    const next = command(
      first,
      "b",
      { type: "restart", gameId: "finished", next: true },
      1,
      "next",
    );
    assert.equal(next.level, level === 16 ? 0 : level + 1);
  }
});
