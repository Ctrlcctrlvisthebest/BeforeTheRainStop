import test from "node:test";
import assert from "node:assert/strict";
import { GUIDE_ROUTES, guideFor, newGuideTracker } from "../src/guide";
import { CAMPFIRES } from "../src/weather";
import { LEVELS } from "../src/game";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { interactiveModules } from "../src/map-rules";
import { completeStormLevel } from "./storm-journeys";

for (let level = 27; level < 40; level++) {
  const map = CHALLENGE_MAPS[level - 8];
  test(`expert chapter ${level + 1}: at least two independent mechanisms and a route requiring active movement`, () => {
    assert.ok(interactiveModules(map).length >= 2);
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

test("chapter 29 returns on its outbound ferry after exploring the island", () => {
  const ferry = LEVELS[28].platforms.findIndex((p) => p.motion);
  let outward = false,
    homeward = false,
    previousX = LEVELS[28].spawn.x;
  completeStormLevel(28, (g) => {
    const p = g.players[0];
    if (p.support === ferry && p.x > previousX && g.keys.length === 0)
      outward = true;
    if (p.support === ferry && p.x < previousX && g.keys.length >= 2)
      homeward = true;
    previousX = p.x;
  });
  assert.ok(outward && homeward);
});

test("chapter 30 opens the lower gate from above, then revisits the first rack", () => {
  let upperOpened = false,
    returned = false;
  completeStormLevel(29, (g) => {
    const p = g.players[0];
    if (!upperOpened && g.gateOpen) {
      assert.ok(p.y > LEVELS[29].gate!.y);
      upperOpened = true;
    }
    if (upperOpened && p.checkpoint === 0 && g.savedKeys.includes(0))
      returned = true;
  });
  assert.ok(upperOpened && returned);
});

test("chapter 32 crosses its latched bridge twice after only one fold", () => {
  const map = CHALLENGE_MAPS[32 - 9],
    center = map.crossing!.x;
  let crossings = 0,
    folds = 0,
    wasFold = false,
    leftBank = false;
  completeStormLevel(
    31,
    (g) => {
      const p = g.players[0];
      if (p.x < center - 1.2 && Math.abs(p.z) < 0.4 && p.grounded)
        leftBank = true;
      if (
        leftBank &&
        g.bridgeLatched &&
        p.x > center + 1.4 &&
        Math.abs(p.z) < 0.4 &&
        Math.abs(p.y - 1) < 0.4
      ) {
        crossings++;
        leftBank = false;
      }
    },
    (_g, input) => {
      if (input.fold && !wasFold) folds++;
      wasFold = input.fold;
    },
  );
  assert.equal(crossings, 2);
  assert.equal(folds, 1);
});

test("chapter 34 turns during three separate flights, with no intermediate ground", () => {
  let airTurns = 0;
  completeStormLevel(33, undefined, (g, input) => {
    if (input.turn && !g.players[0].grounded) airTurns++;
  });
  assert.equal(airTurns, 3);
  assert.throws(
    () =>
      completeStormLevel(33, undefined, (g, input) => {
        if (!g.players[0].grounded) input.turn = false;
      }),
    /chapter 34/,
  );
});

test("chapter 35 lets players choose the order of the two key excursions", () => {
  const original = GUIDE_ROUTES[34];
  try {
    GUIDE_ROUTES[34] = [
      ...original.slice(0, 3),
      ...original.slice(9, 17),
      ...original.slice(3, 9),
      ...original.slice(17),
    ];
    for (const mode of [1, 2, 3, 6] as const) {
      const game = completeStormLevel(34, undefined, undefined, 0, mode);
      assert.equal(game.status, "won");
      assert.equal(game.stars.length, LEVELS[34].stars.length);
    }
  } finally {
    GUIDE_ROUTES[34] = original;
  }
});

test("chapter 35 needs its central drying hearth to sustain all three excursions", () => {
  const original = CAMPFIRES[34];
  CAMPFIRES[34] = [];
  try {
    assert.throws(() => completeStormLevel(34), /soaked/);
  } finally {
    CAMPFIRES[34] = original;
  }
});

test("chapter 36 lands directly from one moving deck onto another", () => {
  const transfer = GUIDE_ROUTES[35].find((s) => s.landingId !== undefined)!;
  let lastSupport = -1,
    transferred = false;
  completeStormLevel(35, (g) => {
    const p = g.players[0];
    if (p.support < 0) return;
    if (lastSupport === transfer.id && p.support === transfer.landingId)
      transferred = true;
    lastSupport = p.support;
  });
  assert.ok(transferred, "no fixed bank intervenes between the decks");
});

test("chapter 40 opens the home gate upstairs and returns over its original bridge", () => {
  const map = CHALLENGE_MAPS[40 - 9],
    center = map.crossing!.x;
  let usedFerry = false,
    returned = false,
    lastX = map.level.spawn.x;
  completeStormLevel(39, (g) => {
    const p = g.players[0];
    if (p.support >= 0 && map.level.platforms[p.support]?.motion)
      usedFerry = true;
    if (
      g.gateOpen &&
      g.keys.length === 3 &&
      lastX > center &&
      p.x <= center &&
      Math.abs(p.z) < 0.4 &&
      p.y < 1.4
    )
      returned = true;
    lastX = p.x;
  });
  assert.ok(usedFerry && returned);
});

test("chapter 38 leaps both fires and turns in flight at the final empty corner", () => {
  const crossed = new Set<number>();
  let airTurns = 0;
  completeStormLevel(37, (g) => {
    const p = g.players[0];
    LEVELS[37].hazards.forEach((h, index) => {
      if (Math.hypot(p.x - h.x, p.z - h.z) < 0.4) {
        assert.ok(!p.grounded && p.y > h.y + 0.85);
        crossed.add(index);
      }
    });
  }, (g, input) => {
    if (input.turn && !g.players[0].grounded) airTurns++;
  });
  assert.equal(crossed.size, 2);
  assert.equal(airTurns, 1);
  assert.throws(() => completeStormLevel(37, undefined, (g, input) => {
    if (!g.players[0].grounded) input.turn = false;
  }), /chapter 38/);
});

test("chapter 39 can open the gate before fetching the side-path key", () => {
  const original = GUIDE_ROUTES[38];
  const pads = original.findIndex((s) => s.kind === "pads");
  // The five-step key excursion can happen before or after opening the gate.
  const start = pads - 5;
  try {
    GUIDE_ROUTES[38] = [
      ...original.slice(0, start), original[pads],
      { kind: "walk", target: { x: 15.35, y: 4, z: -12.6 }, view: 1 },
      ...original.slice(start, pads), ...original.slice(pads + 1),
    ];
    for (const mode of [1, 2, 3, 6] as const) {
      let openedBeforeKey = false;
      const game = completeStormLevel(38, (g) => {
        if (g.gateOpen && !g.keys.includes(1)) openedBeforeKey = true;
      }, undefined, 0, mode);
      assert.ok(openedBeforeKey);
      assert.equal(game.stars.length, LEVELS[38].stars.length);
      assert.equal(game.status, "won");
    }
  } finally {
    GUIDE_ROUTES[38] = original;
  }
});

test("chapter 39 lets a courier fetch the key while two friends open the gate", () => {
  const pads = GUIDE_ROUTES[38].findIndex((s) => s.kind === "pads");
  for (const mode of [3, 6] as const) {
    let concurrentWork = false, courierOwnedKey = false;
    const gateGuide = newGuideTracker();
    const game = completeStormLevel(38, (g) => {
      const courier = g.players[2];
      if (courier.x > 18.5 && (g.gateCharge > 0 || g.gateOpen))
        concurrentWork = true;
      if (g.gateCharge > 0 && !g.keys.includes(1)) {
        const guide = guideFor(g, 0, gateGuide);
        assert.equal(guide.kind, "pads");
        assert.equal(guide.direction, "stay");
      }
      if (courier.carriedKeys.includes(1)) {
        courierOwnedKey = true;
        assert.ok(g.players[0].x < 16 && g.players[1].x < 16);
      }
    }, undefined, 0, mode, { start: pads - 5, end: pads });
    assert.ok(concurrentWork && courierOwnedKey);
    assert.equal(game.status, "won");
    assert.equal(game.stars.length, LEVELS[38].stars.length);
    assert.ok(game.players.every((p) => p.arrived && p.deaths === 0));
  }
});

test("chapter 39 shelter reduces exposure at the first ferry without being required for every departure", () => {
  const exposure = (shelter: boolean) => {
    let wettest = 0;
    completeStormLevel(38, (g) => {
      if (g.players[0].checkpoint < 0)
        wettest = Math.max(wettest, g.players[0].wetness);
    }, (_g, input) => { if (!shelter) input.shelter = false; });
    return wettest;
  };
  assert.ok(exposure(false) - exposure(true) > 10);
});

test("chapter 39's optional drying eaves are reachable and rejoin the full-star route", () => {
  const original = GUIDE_ROUTES[38];
  let driedUnderEaves = false;
  try {
    GUIDE_ROUTES[38] = [
      ...original.slice(0, 2),
      { kind: "jump", target: { x: 10.95, y: 2.1, z: 0 }, view: 0 },
      { kind: "jump", target: { x: 7.15, y: 1.1, z: 0 }, view: 0 },
      ...original.slice(2),
    ];
    const game = completeStormLevel(38, (g) => {
      const p = g.players[0];
      if (Math.abs(p.x - 10.95) < 0.5 && Math.abs(p.z) < 0.4 &&
          p.nearFire && p.rainCover === "roof" && p.wetness < 1) driedUnderEaves = true;
    }, (g, input) => {
      const p = g.players[0];
      if (p.grounded && Math.abs(p.x - 10.95) < 0.5 && Math.abs(p.z) < 0.4 && p.wetness > 1) {
        input.axis = 0;
        input.jump = false;
      }
    });
    assert.ok(driedUnderEaves);
    assert.equal(game.stars.length, LEVELS[38].stars.length);
    assert.equal(game.status, "won");
  } finally {
    GUIDE_ROUTES[38] = original;
  }
});
