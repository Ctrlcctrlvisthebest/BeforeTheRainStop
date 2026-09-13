import { completeStormLevel } from "./storm-journeys";
import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, MODES, newGame, idleInput, stepGame } from "../src/game";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { GUIDE_ROUTES } from "../src/guide";
import { validateMap } from "../src/map-format";
import { translate } from "../src/i18n";
import { command, joinRoom, makeRoom } from "../src/room";

for (let level = 9; level < LEVELS.length; level++) {
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
      assert.equal(
        g.stars.length,
        LEVELS[level].stars.length,
        "the complete guided route reaches every star",
      );
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

test("the entire campaign advances in order and only chapter 27 wraps to the start", () => {
  for (const level of LEVELS.map((_, i) => i)) {
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
    assert.equal(next.level, level === LEVELS.length - 1 ? 0 : level + 1);
  }
});

const revisedAndNew = [
  9,
  10,
  11,
  ...Array.from({ length: 10 }, (_, i) => i + 17),
];
for (const level of revisedAndNew)
  for (const mode of [2, 3, 6] as const)
    test(`chapter ${level + 1}: ${mode} players collect every star and finish using only controls`, () => {
      const g = completeStormLevel(level, undefined, undefined, 90, mode);
      assert.equal(g.status, "won");
      assert.equal(g.stars.length, LEVELS[level].stars.length);
      assert.ok(g.players.every((p) => p.arrived && p.deaths === 0));
    });

test("the expanded campaign has 27 unique names and valid, supported maps", () => {
  assert.equal(LEVELS.length, 27);
  assert.equal(CHALLENGE_MAPS.length, 19);
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 27);
  assert.equal(new Set(LEVELS.map((l) => translate("en", l.name))).size, 27);
  for (const map of CHALLENGE_MAPS)
    assert.deepEqual(validateMap(map), { errors: [], warnings: [] });
});

// Normalize translation, reflection and swapping the movement axes. This catches
// literal layout clones; the gameplay/topology audit is documented separately.
function terrainSignature(index: number) {
  const l = LEVELS[index],
    variants: string[] = [];
  for (const swap of [false, true])
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const axis = swap ? "z" : "x",
          other = swap ? "x" : "z";
        variants.push(
          JSON.stringify(
            l.platforms
              .map((p) => [
                +(sx * (p[axis] - l.spawn[axis])).toFixed(3),
                +(sz * (p[other] - l.spawn[other])).toFixed(3),
                +(p.y - l.spawn.y).toFixed(3),
                swap ? p.d : p.w,
                swap ? p.w : p.d,
                p.h,
                p.motion
                  ? [
                      p.motion.axis === axis ? "x" : "z",
                      p.motion.range,
                      p.motion.period,
                    ]
                  : null,
              ])
              .sort((a, b) =>
                JSON.stringify(a).localeCompare(JSON.stringify(b)),
              ),
          ),
        );
      }
  return variants.sort()[0];
}
test("new and redesigned levels are not translated, mirrored or axis-swapped terrain copies", () => {
  for (const level of revisedAndNew)
    for (let other = 0; other < LEVELS.length; other++)
      if (other !== level)
        assert.notEqual(
          terrainSignature(level),
          terrainSignature(other),
          `${level + 1} duplicates ${other + 1}`,
        );
});

test("chapter 20 requires jumping to reach the first key", () => {
  let keys = 0;
  assert.throws(
    () =>
      completeStormLevel(
        19,
        (g) => {
          keys = g.keys.length;
        },
        (_g, input) => {
          input.jump = false;
        },
      ),
    /chapter 20/,
  );
  assert.equal(keys, 0);
});

test("chapter 20 gate blocks the ferry approach until both teammates hold their plates", () => {
  const l = LEVELS[19],
    g = newGame(2, 19);
  g.players.forEach((p) => Object.assign(p, l.pads[0]));
  for (let frame = 0; frame < 260; frame++) stepGame(g, {});
  assert.equal(g.gateOpen, false);
  const right = {
    0: { ...idleInput(), axis: 1 },
    1: { ...idleInput(), axis: 1 },
  };
  for (let frame = 0; frame < 80; frame++) stepGame(g, right);
  assert.ok(g.players.every((p) => p.x < l.gate!.x && p.deaths === 0));
  g.players.forEach((p, i) => Object.assign(p, l.pads[i]));
  for (let frame = 0; frame < 260; frame++) stepGame(g, {});
  assert.equal(g.gateOpen, true);
  for (let frame = 0; frame < 60; frame++) stepGame(g, right);
  assert.ok(g.players.every((p) => p.x > l.gate!.x && p.deaths === 0));
});
