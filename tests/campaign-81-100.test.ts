import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, newGame, stepGame } from "../src/game";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { interactiveModules } from "../src/map-rules";
import { validateMap } from "../src/map-format";
import { completeStormLevel } from "./storm-journeys";

for (let chapter = 81; chapter <= 100; chapter++) {
  test(`chapter ${chapter}: authored geometry, mechanisms and full-star route`, () => {
    const index = CHALLENGE_MAPS.findIndex((m) => m.chapter === chapter);
    assert.ok(index >= 0, "chapter registered");
    const map = CHALLENGE_MAPS[index];
    assert.deepEqual(validateMap(map, chapter).errors, []);
    assert.deepEqual(validateMap(map, chapter).warnings, []);
    assert.ok(interactiveModules(map).length >= 2);
    const level = index + 8;
    for (const mode of [1, 2, 3, 6] as const)
      for (const delay of [0, 90, 210, 330]) {
        const g = completeStormLevel(level, undefined, undefined, delay, mode);
        assert.equal(g.status, "won");
        assert.equal(g.keys.length, LEVELS[level].keys.length);
        assert.equal(g.stars.length, LEVELS[level].stars.length);
        assert.ok(g.players.every((p) => p.arrived && p.deaths === 0));
      }
  });
}

for (let chapter = 81; chapter <= 100; chapter++) {
  const index = CHALLENGE_MAPS.findIndex((m) => m.chapter === chapter);
  const level = index + 8;
  test(`chapter ${chapter}: the updraft is required to reach its upper landing`, () => {
    const original = LEVELS[level].winds;
    LEVELS[level].winds = [];
    try {
      assert.throws(() => completeStormLevel(level), /"stage":"\d+ wind"/);
    } finally {
      LEVELS[level].winds = original;
    }
  });
  if (CHALLENGE_MAPS[index].crossing)
    test(`chapter ${chapter}: the roofed crossing needs a real paper bridge`, () => {
      assert.throws(() =>
        completeStormLevel(level, undefined, (_g, input) => {
          input.fold = false;
        }),
      );
    });
}

function campaignIndex(chapter: number) {
  return CHALLENGE_MAPS.findIndex((m) => m.chapter === chapter) + 8;
}

test("chapter 81 revisits its actual hub after each of the two upper circuits", () => {
  const hub = { x: 7.15, y: 1, z: 0 };
  const returns = new Set<number>();
  completeStormLevel(campaignIndex(81), (g) => {
    const p = g.players[0];
    if (
      p.grounded &&
      Math.hypot(p.x - hub.x, p.z - hub.z) < 0.45 &&
      Math.abs(p.y - hub.y) < 0.1
    )
      returns.add(g.keys.length);
  });
  assert.ok(returns.has(1) && returns.has(2));
});

test("chapter 84 visits the shared bridge landing between the two wish wings", () => {
  let returned = false;
  completeStormLevel(campaignIndex(84), (g) => {
    const p = g.players[0];
    if (
      g.bridgeLatched &&
      g.keys.length === 1 &&
      p.grounded &&
      Math.hypot(p.x - 12.65, p.z) < 0.45 &&
      Math.abs(p.y - 1) < 0.1
    )
      returned = true;
  });
  assert.ok(returned);
});

test("chapter 88 turns during two descents before climbing back up its side well", () => {
  let turns = 0;
  completeStormLevel(campaignIndex(88), undefined, (g, input) => {
    if (input.turn && !g.players[0].grounded) turns++;
  });
  assert.equal(turns, 2);
});

test("chapter 89 takes its suspended key during a jump from the moving boat", () => {
  const level = campaignIndex(89);
  let airbornePickup = false;
  completeStormLevel(level, (g) => {
    if (g.keys.includes(0) && !g.players[0].grounded && g.players[0].y > 1)
      airbornePickup = true;
  });
  assert.ok(airbornePickup);
});

test("chapter 90 opens the spawn-floor gate before taking its first updraft", () => {
  const level = campaignIndex(90);
  let openedAtSpawn = false;
  completeStormLevel(level, (g) => {
    if (g.gateOpen && g.keys.length === 0 && g.players[0].y < 8)
      openedAtSpawn = true;
  });
  assert.ok(openedAtSpawn);
});

test("chapter 91 ascends three distinct parallel wind rows in alternating directions", () => {
  const level = campaignIndex(91);
  const winds = LEVELS[level].winds;
  assert.equal(winds.length, 3);
  assert.equal(new Set(winds.map((w) => w.z)).size, 3);
  const visits = new Set<number>();
  completeStormLevel(level, (g) => {
    const p = g.players[0];
    winds.forEach((w, i) => {
      if (
        Math.abs(p.x - w.x) < w.w / 2 &&
        Math.abs(p.z - w.z) < w.d / 2 &&
        p.y > w.y + 1
      )
        visits.add(i);
    });
  });
  assert.equal(visits.size, 3);
});

test("chapter 99 returns aboard its original ferry and keeps both branch keys", () => {
  const level = campaignIndex(99);
  const ferry = LEVELS[level].platforms.findIndex((p) => p.motion);
  let out = false,
    back = false,
    previous = LEVELS[level].spawn.x;
  completeStormLevel(level, (g) => {
    const p = g.players[0];
    if (p.support === ferry && p.x > previous && g.keys.length === 1)
      out = true;
    if (p.support === ferry && p.x < previous && g.keys.length === 2)
      back = true;
    previous = p.x;
  });
  assert.ok(out && back);
});

test("chapter 100 uses every mechanism family and exits above the original courtyard", () => {
  const level = campaignIndex(100);
  let onBoat = false;
  const g = completeStormLevel(level, (g) => {
    const support = g.players[0].support;
    if (support >= 0 && LEVELS[level].platforms[support]?.motion) onBoat = true;
  });
  assert.ok(onBoat && g.bridgeLatched && g.gateOpen);
  assert.ok(g.players.every((p) => p.y > LEVELS[level].spawn.y + 5));
});

for (let chapter = 81; chapter <= 100; chapter++)
  test(`chapter ${chapter}: all six starting seats can wait one minute safely`, () => {
    const g = newGame(6, campaignIndex(chapter));
    for (let frame = 0; frame < 3600; frame++) stepGame(g, {});
    assert.ok(
      g.players.every(
        (p) => p.deaths === 0 && p.wetness === 0 && p.heat === 0 && p.grounded,
      ),
    );
  });

test("chapter 83 descends to three different wish floors and returns to its upper survey court", () => {
  const floors = new Set<number>();
  const returns = new Set<number>();
  completeStormLevel(campaignIndex(83), (g) => {
    const p = g.players[0];
    for (const key of LEVELS[campaignIndex(83)].keys)
      if (
        Math.hypot(p.x - key.x, p.z - key.z) < 0.5 &&
        Math.abs(p.y - (key.y - 0.7)) < 0.15
      )
        floors.add(key.y - 0.7);
    if (
      p.grounded &&
      Math.abs(p.y - 10) < 0.1 &&
      Math.hypot(p.x - 1, p.z) < 0.5
    )
      returns.add(g.keys.length);
  });
  assert.equal(floors.size, 3);
  assert.ok(returns.has(1) && returns.has(2));
});
