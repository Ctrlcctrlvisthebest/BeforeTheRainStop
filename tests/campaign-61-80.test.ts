import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../src/game";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { completeStormLevel } from "./storm-journeys";

for (let chapter = 61; chapter <= 80; chapter++) {
  const level = chapter - 1;
  const map = CHALLENGE_MAPS[chapter - 9];
  test(`chapter ${chapter}: four party sizes and four departure phases finish with every star`, () => {
    for (const mode of [1, 2, 3, 6] as const)
      for (const delay of [0, 90, 210, 330]) {
        const boarded = new Set<number>();
        const lifted = new Set<number>();
        const game = completeStormLevel(
          level,
          (g) => {
            for (const bird of g.players) {
              if (
                bird.support >= 0 &&
                map.level.platforms[bird.support]?.motion
              )
                boarded.add(bird.support);
              map.level.winds.forEach((wind, id) => {
                if (
                  bird.vy > 0 &&
                  bird.y >= wind.y &&
                  bird.y < wind.y + wind.height &&
                  Math.abs(bird.x - wind.x) < wind.w / 2 &&
                  Math.abs(bird.z - wind.z) < wind.d / 2
                )
                  lifted.add(id);
              });
            }
          },
          undefined,
          delay,
          mode,
        );
        assert.equal(game.status, "won");
        assert.equal(game.keys.length, LEVELS[level].keys.length);
        assert.equal(game.stars.length, LEVELS[level].stars.length);
        assert.ok(
          game.players.every((bird) => bird.deaths === 0 && bird.arrived),
        );
        for (const step of map.route)
          if (step.kind === "ferry")
            assert.ok(
              boarded.has(step.id!),
              `ferry ${step.id} must actually carry players`,
            );
        assert.equal(
          lifted.size,
          map.level.winds.length,
          "every authored updraft is used",
        );
        if (map.crossing) assert.ok(game.bridgeLatched);
        if (map.level.pads.length) assert.ok(game.gateOpen);
      }
  });
  test(`chapter ${chapter}: ordinary walking cannot replace its jumps`, () => {
    assert.throws(() =>
      completeStormLevel(level, undefined, (_g, input) => {
        input.jump = false;
      }),
    );
  });
}

test("the timing chapters retain their different physical challenges", () => {
  const map = (chapter: number) => CHALLENGE_MAPS[chapter - 9];
  assert.ok(map(61).route.some((step) => step.via));
  const transfer = map(62).route.find((step) => step.landingId !== undefined)!;
  assert.ok(transfer);
  assert.notEqual(transfer.id, transfer.landingId);
  assert.notEqual(
    map(62).level.platforms[transfer.id!].motion!.axis,
    map(62).level.platforms[transfer.landingId!].motion!.axis,
  );
  assert.equal(map(64).level.hazards.length, 2);
  assert.ok(map(65).level.gate && map(65).crossing);
  assert.equal(map(66).level.winds.length, 3);
  assert.ok(map(67).route.some((step) => step.requiredKey !== undefined));
  assert.equal(
    new Set(map(68).level.hazards.map((fire) => fire.period)).size,
    2,
  );
  assert.equal(map(69).crossing!.axis, "x");
  assert.ok(
    map(70).level.hazards.length &&
      map(70).route.some((step) => step.requiredKey !== undefined),
  );
  assert.equal(map(71).level.spawn.y, 14);
  assert.equal(map(72).crossing!.axis, "z");
  assert.equal(map(73).level.winds.length, 2);
  assert.ok(map(74).route.some((step) => step.via));
  assert.equal(map(75).level.hazards.length, 3);
  assert.equal(
    map(75).level.platforms.filter((platform) => platform.motion).length,
    0,
  );
  assert.equal(map(76).level.winds.length, 2);
  assert.equal(
    map(77).level.platforms.filter((platform) => platform.motion).length,
    3,
  );
  assert.equal(map(78).route.filter((step) => step.via).length, 2);
  assert.equal(map(78).level.spawn.y, 15);
  assert.equal(map(79).crossing!.axis, "z");
  for (const kind of ["ferry", "wind", "bridge", "pads"])
    assert.ok(map(80).route.some((step) => step.kind === kind));
});
