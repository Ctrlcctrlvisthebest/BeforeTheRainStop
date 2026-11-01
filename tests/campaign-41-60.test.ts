import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { LEVELS, newGame, stepGame } from "../src/game";
import { interactiveModules, oversizedGroundRuns } from "../src/map-rules";
import { validateMap } from "../src/map-format";
import { completeStormLevel } from "./storm-journeys";

for (let chapter = 41; chapter <= 60; chapter++) {
  const offset = CHALLENGE_MAPS.findIndex((m) => m.chapter === chapter);
  assert.ok(offset >= 0, `chapter ${chapter} is registered`);
  const level = offset + 8;
  const map = CHALLENGE_MAPS[offset];
  test(`chapter ${chapter}: actual geometry and active mechanisms meet the campaign rules`, () => {
    assert.deepEqual(validateMap(map, chapter).errors, []);
    assert.deepEqual(oversizedGroundRuns(map.level.platforms), []);
    assert.ok(interactiveModules(map).length >= 2);
    assert.ok(map.route.filter((r) => r.kind === "jump").length >= 4);
    assert.ok(
      map.route.some((r) => r.view === 0) &&
        map.route.some((r) => r.view === 1),
    );
  });
  test(`chapter ${chapter}: all six seats can wait at spawn for 61 seconds`, () => {
    const game = newGame(6, level);
    for (let frame = 0; frame < 3660; frame++) stepGame(game, {});
    assert.ok(
      game.players.every(
        (p) => p.deaths === 0 && p.heat === 0 && p.wetness === 0,
      ),
    );
  });
  test(`chapter ${chapter}: full-star route with ordinary controls`, () => {
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
        assert.ok(game.players.every((p) => p.arrived && p.deaths === 0));
      }
  });
}

interface JourneyEvents {
  keys: { x: number; y: number; z: number }[];
  boatVisits: number[];
  winds: Set<number>;
  gateAtKeys: number | undefined;
  bridgeAtKeys: number | undefined;
  maxHeight: number;
}
function eventsFor(chapter: number): JourneyEvents {
  const level = CHALLENGE_MAPS.findIndex((m) => m.chapter === chapter) + 8;
  const map = LEVELS[level];
  const events: JourneyEvents = {
    keys: [],
    boatVisits: [],
    winds: new Set(),
    gateAtKeys: undefined,
    bridgeAtKeys: undefined,
    maxHeight: -Infinity,
  };
  let previousSupport = -1;
  completeStormLevel(level, (game) => {
    const p = game.players[0];
    events.maxHeight = Math.max(events.maxHeight, p.y);
    if (game.keys.length > events.keys.length)
      events.keys.push({ x: p.x, y: p.y, z: p.z });
    if (p.support !== previousSupport && map.platforms[p.support]?.motion)
      events.boatVisits.push(p.support);
    previousSupport = p.support;
    if (game.gateOpen && events.gateAtKeys === undefined)
      events.gateAtKeys = game.keys.length;
    if (game.bridgeLatched && events.bridgeAtKeys === undefined)
      events.bridgeAtKeys = game.keys.length;
    map.winds.forEach((wind, index) => {
      if (
        Math.abs(p.x - wind.x) < wind.w / 2 &&
        Math.abs(p.z - wind.z) < wind.d / 2 &&
        p.y >= wind.y &&
        p.y < wind.y + wind.height &&
        p.vy > 0
      )
        events.winds.add(index);
    });
  });
  return events;
}
const experiences: [number, string, (events: JourneyEvents) => void][] = [
  [
    41,
    "crosses the well high and recovers its second key below the first",
    (e) => {
      assert.equal(e.bridgeAtKeys, 1);
      assert.ok(e.keys[0].y > e.keys[1].y + 2);
      assert.ok(e.keys[0].z < -9 && e.keys[1].z > -2);
    },
  ],
  [
    42,
    "opens at the spawn before reaching either of two separate upper winds",
    (e) => {
      assert.equal(e.gateAtKeys, 0);
      assert.equal(e.winds.size, 2);
      assert.ok(e.keys[0].x > 11 && e.keys[1].x < -2);
    },
  ],
  [
    43,
    "jumps for a note aboard the ferry, then turns toward the shrine before unlocking",
    (e) => {
      assert.equal(new Set(e.boatVisits).size, 1);
      assert.equal(e.boatVisits.length, 2);
      assert.equal(e.winds.size, 1);
      assert.equal(e.gateAtKeys, 3);
      assert.ok(Math.abs(e.keys[0].z) < 1 && e.keys[0].y > 1.9);
      assert.ok(e.keys[1].z < -6 && e.keys[2].z < -12);
    },
  ],
  [
    44,
    "climbs opposite sides of an open well before descending inside",
    (e) => {
      assert.equal(e.winds.size, 2);
      assert.ok(e.keys[1].y > e.keys[0].y + 4);
      assert.ok(e.maxHeight > 12);
    },
  ],
  [
    45,
    "uses two opening winds and a high bridge before unlocking the low gallery",
    (e) => {
      assert.equal(e.winds.size, 2);
      assert.equal(e.bridgeAtKeys, 1);
      assert.equal(e.gateAtKeys, 2);
      assert.ok(e.keys[0].y > 8 && e.keys[1].x < 2);
    },
  ],
  [
    46,
    "sails outward and returns above the boat along the bridge gallery",
    (e) => {
      assert.equal(e.boatVisits.length, 1);
      assert.equal(e.bridgeAtKeys, 2);
      assert.ok(e.keys[0].z > 9 && e.keys[1].z > 5);
    },
  ],
  [
    47,
    "descends to unlock, sails south, then recovers the final note after a wind and midair turn",
    (e) => {
      assert.equal(e.winds.size, 1);
      assert.equal(e.gateAtKeys, 0);
      assert.equal(e.boatVisits.length, 1);
      assert.equal(e.keys.length, 3);
      assert.ok(e.keys[1].y > e.keys[2].y + 1);
      assert.ok(e.keys[2].x < -1);
    },
  ],
  [
    48,
    "begins with perpendicular boats and returns through a higher bridge",
    (e) => {
      assert.equal(new Set(e.boatVisits).size, 2);
      assert.equal(e.bridgeAtKeys, 2);
      assert.ok(e.keys[1].x < e.keys[0].x - 8);
    },
  ],
  [
    49,
    "turns in midair before a side ferry and reaches the distant upper shrine",
    (e) => {
      assert.equal(e.boatVisits.length, 1);
      assert.ok(e.keys[0].z < -14);
      assert.ok(e.keys[1].x > e.keys[0].x + 9);
      assert.ok(e.keys[1].y > e.keys[0].y + 4);
    },
  ],
  [
    50,
    "opens from the far bank and bridges home only after both keys",
    (e) => {
      assert.equal(e.gateAtKeys, 0);
      assert.equal(e.boatVisits.length, 1);
      assert.equal(e.bridgeAtKeys, 2);
      assert.ok(e.keys[1].x < e.keys[0].x - 9);
    },
  ],
  [
    51,
    "collects three required notes on successively lower terraces",
    (e) => {
      assert.equal(e.winds.size, 2);
      assert.equal(e.keys.length, 3);
      assert.ok(e.keys[0].y > e.keys[1].y + 1);
      assert.ok(e.keys[1].y > e.keys[2].y + 1);
    },
  ],
  [
    52,
    "unlocks upstairs and recovers the lower key after a long side crossing",
    (e) => {
      assert.equal(e.gateAtKeys, 0);
      assert.equal(e.boatVisits.length, 1);
      assert.ok(e.keys[0].y > e.keys[1].y + 2);
      assert.ok(e.keys[1].z > 10);
    },
  ],
  [
    53,
    "crosses between separate courts before returning along a bridge",
    (e) => {
      assert.equal(e.boatVisits.length, 1);
      assert.equal(e.bridgeAtKeys, 2);
      assert.ok(Math.abs(e.keys[0].z) < 1 && e.keys[1].z < -16);
    },
  ],
  [
    54,
    "uses different outbound and homeward boats on perpendicular axes",
    (e) => {
      assert.equal(new Set(e.boatVisits).size, 2);
      assert.ok(e.keys[1].x < e.keys[0].x - 11);
      assert.ok(e.keys[1].z > e.keys[0].z + 3);
    },
  ],
  [
    55,
    "must bridge before the first note and descend to the side ferry",
    (e) => {
      assert.equal(e.bridgeAtKeys, 0);
      assert.equal(e.boatVisits.length, 1);
      assert.ok(e.keys[0].y > e.keys[1].y + 1);
    },
  ],
  [
    56,
    "climbs two outside corners before bridging over the courtyard centre",
    (e) => {
      assert.equal(e.winds.size, 2);
      assert.equal(e.bridgeAtKeys, 2);
      assert.ok(e.keys[1].y > e.keys[0].y + 4);
    },
  ],
  [
    57,
    "collects below before rising behind the lock and leaving by separate descending steps",
    (e) => {
      assert.equal(e.gateAtKeys, 1);
      assert.equal(e.winds.size, 2);
      assert.ok(e.keys[0].y < e.keys[1].y - 3);
      assert.ok(e.keys[2].z > e.keys[1].z + 9);
    },
  ],
  [
    58,
    "takes the high route out and the low boat back before bridging",
    (e) => {
      assert.equal(e.boatVisits.length, 1);
      assert.equal(e.bridgeAtKeys, 2);
      assert.ok(e.keys[1].x < e.keys[0].x - 3);
      assert.ok(e.keys[1].y < e.keys[0].y - 1);
    },
  ],
  [
    59,
    "lands and climbs between perpendicular ferries rather than transferring at sea",
    (e) => {
      assert.equal(new Set(e.boatVisits).size, 2);
      assert.equal(e.winds.size, 1);
      assert.ok(e.keys[1].z < e.keys[0].z - 10);
    },
  ],
  [
    60,
    "unlocks first, crosses back, and bridges before the third courtyard note",
    (e) => {
      assert.equal(e.gateAtKeys, 0);
      assert.equal(e.bridgeAtKeys, 2);
      assert.equal(e.boatVisits.length, 1);
      assert.equal(e.keys.length, 3);
      assert.ok(e.keys[2].z > 4);
    },
  ],
];
for (const [chapter, experience, verify] of experiences)
  test(`chapter ${chapter}: ${experience}`, () => verify(eventsFor(chapter)));

for (let chapter = 41; chapter <= 60; chapter++) {
  const level = CHALLENGE_MAPS.findIndex((m) => m.chapter === chapter) + 8;
  test(`chapter ${chapter}: the route requires active jumping and a change of view`, () => {
    assert.throws(() =>
      completeStormLevel(level, undefined, (_game, input) => {
        input.jump = false;
      }),
    );
    assert.throws(() =>
      completeStormLevel(level, undefined, (_game, input) => {
        input.turn = false;
      }),
    );
  });
  if (CHALLENGE_MAPS[level - 8].crossing)
    test(`chapter ${chapter}: a paper bridge cannot be replaced by walking under the low eave`, () => {
      assert.throws(() =>
        completeStormLevel(level, undefined, (_game, input) => {
          input.fold = false;
        }),
      );
    });
}
