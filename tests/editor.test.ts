import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  newGame,
  stepGame,
  idleInput,
  activeHazard,
  platformAt,
} from "../src/game";
import {
  WEATHER,
  CAMPFIRES,
  BLAZE_ROOFS,
  firesForWeather,
  blazeRoofsFor,
} from "../src/weather";
import { CROSSINGS } from "../src/bridges";
import { GUIDE_ROUTES } from "../src/guide";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import {
  starterMap,
  parseMap,
  serializeMap,
  validateMap,
  type MapFile,
} from "../src/map-format";
import {
  addEntity,
  editEntity,
  removeEntity,
  platformStylePatch,
  platformMotionPatch,
  duplicateEntity,
  syncRoute,
  entities,
  entity,
  moveEntity,
  type Selection,
} from "../src/editor-model";
import { campfire, animateFire } from "../src/fire-scene";
import { installPreviewMap } from "../src/preview-map";

test("choosing the ferry style exports a platform that actually carries players", () => {
  const map = starterMap();
  const selection = { kind: "platforms" as const, index: 0 };
  const edited = editEntity(
    map,
    selection,
    platformStylePatch(map.level.platforms[0], "moving"),
  );
  const exported = parseMap(JSON.parse(serializeMap(edited)));
  const platform = exported.level.platforms[0];
  assert.ok(platform.motion);
  assert.equal(
    platformAt(platform, platform.motion.period / 4).x,
    platform.x + platform.motion.range,
  );
  LEVELS.push(exported.level);
  const g = newGame(1, LEVELS.length - 1),
    p = g.players[0];
  p.x = platform.x;
  p.y = platform.y;
  p.z = platform.z;
  p.grounded = true;
  p.support = 0;
  const before = p.x;
  try {
    // The exported test map has no rain or fires.
    WEATHER.push(exported.weather);
    CAMPFIRES.push([]);
    BLAZE_ROOFS.push([]);
    for (let i = 0; i < 60; i++) stepGame(g, [idleInput()], 1 / 60);
    assert.ok(
      p.x > before + 1,
      "standing crane rides the new motion instead of staying on a recolored slab",
    );
  } finally {
    LEVELS.pop();
    WEATHER.pop();
    CAMPFIRES.pop();
    BLAZE_ROOFS.pop();
  }
  assert.equal(
    map.level.platforms[0].motion,
    undefined,
    "original draft remains unchanged",
  );
});

test("motion toggle preserves custom settings and stops exported movement cleanly", () => {
  const base = starterMap().level.platforms[0];
  const moving = { ...base, ...platformMotionPatch(base, true) };
  moving.motion = { axis: "z", range: 3, period: 8 };
  const restyled = { ...moving, ...platformStylePatch(moving, "moving") };
  assert.deepEqual(restyled.motion, moving.motion);
  const stopped = { ...restyled, ...platformMotionPatch(restyled, false) };
  assert.equal(stopped.kind, undefined);
  assert.equal(stopped.motion, undefined);
  assert.deepEqual(platformAt(stopped, 99), stopped);
  assert.equal(
    platformStylePatch(base, "step").motion,
    undefined,
    "step style does not secretly enable motion",
  );
  const oldDraft = starterMap();
  oldDraft.level.platforms[0].kind = "moving";
  assert.ok(
    validateMap(oldDraft).warnings.some((w) => w.includes("未开启往返移动")),
    "old stationary ferry drafts explain how to enable movement",
  );
});

test("all campaign maps round trip through the exact editor export format", () => {
  LEVELS.forEach((level, i) => {
    const m: MapFile = {
      format: "before-the-rain-map",
      version: 1,
      level,
      weather: WEATHER[i],
      route: GUIDE_ROUTES[i],
      ...(CROSSINGS[i] ? { crossing: CROSSINGS[i] } : {}),
    };
    assert.deepEqual(
      parseMap(JSON.parse(serializeMap(m))),
      JSON.parse(JSON.stringify(m)),
    );
  });
  assert.equal(CHALLENGE_MAPS.length, 32);
});
test("invalid imports fail cleanly before replacing a draft or running physics", () => {
  const valid = starterMap();
  const invalidMaps: unknown[] = [
    { ...valid, version: 2 },
    {
      ...valid,
      level: {
        ...valid.level,
        platforms: [{ ...valid.level.platforms[0], w: -1 }],
      },
    },
    {
      ...valid,
      weather: {
        ...valid.weather,
        zones: [{ x: 0, z: 0, w: 4, d: 4, rate: Infinity }],
      },
    },
    { ...valid, route: { length: 1 } },
    { ...valid, level: { ...valid.level, spawn: null } },
    {
      ...valid,
      route: [
        { kind: "ferry", id: 0, target: { x: 0, y: 0, z: 0 }, view: 0 },
        { kind: "exit", target: { x: 9, y: 0, z: 0 }, view: 0 },
      ],
    },
  ];
  for (const bad of invalidMaps) {
    assert.ok(validateMap(bad).errors.length);
    assert.throws(() => parseMap(bad));
  }
  assert.equal(validateMap(valid).errors.length, 0);
});
test("editing and deleting keys keeps guide references and ferry pickups consistent", () => {
  let m = starterMap();
  m = addEntity(m, "keys", { x: 2, y: 0, z: 0 }).map;
  m = addEntity(m, "keys", { x: 5, y: 0, z: 0 }).map;
  const before = structuredClone(m);
  m = editEntity(m, { kind: "keys", index: 1 }, { x: 6, y: 1.7 });
  assert.equal(before.level.keys[1].x, 5);
  assert.deepEqual(
    m.route.find((r) => r.kind === "key" && r.id === 1)?.target,
    { x: 6, y: 1, z: 0 },
  );
  m = removeEntity(m, { kind: "keys", index: 0 });
  assert.equal(m.level.keys[0].x, 6);
  assert.equal(m.route.find((r) => r.kind === "key")?.id, 0);
  m = duplicateEntity(m, { kind: "keys", index: 0 }).map;
  assert.equal(m.level.keys.length, 2);
  assert.equal(validateMap(m).errors.length, 0);
});
test("removing a moving platform remaps later ferry references", () => {
  const m = structuredClone(CHALLENGE_MAPS[3]);
  const index = m.route.findIndex((r) => r.kind === "ferry");
  const next = removeEntity(m, { kind: "platforms", index: 0 });
  assert.equal(next.route[index].id, m.route[index].id! - 1);
  const without = removeEntity(m, {
    kind: "platforms",
    index: m.route[index].id!,
  });
  assert.ok(!without.route.some((r) => r.kind === "ferry"));
});
test("exported edited map can be loaded into the real simulation and finished", () => {
  let m = starterMap();
  m = addEntity(m, "keys", { x: 4, y: 0, z: 0 }).map;
  m = editEntity(m, { kind: "exit", index: 0 }, { x: 8 });
  m = parseMap(JSON.parse(serializeMap(m)));
  const index = LEVELS.length;
  LEVELS.push(m.level);
  WEATHER.push(m.weather);
  CAMPFIRES.push(firesForWeather(m.weather));
  BLAZE_ROOFS.push(blazeRoofsFor(m.level));
  try {
    const g = newGame(1, index);
    for (let i = 0; i < 180; i++)
      stepGame(g, { 0: { ...idleInput(), axis: 1 } });
    assert.equal(g.status, "won");
    assert.equal(g.keys.length, 1);
    assert.equal(g.players[0].deaths, 0);
  } finally {
    LEVELS.pop();
    WEATHER.pop();
    CAMPFIRES.pop();
    BLAZE_ROOFS.pop();
  }
});
test("paper bridge component includes low eaves and remains a valid export", () => {
  const { map: m } = addEntity(starterMap(), "crossing", { x: 18, y: 0, z: 0 });
  assert.ok(m.level.platforms.some((p) => p.kind === "low-roof"));
  assert.ok(m.route.some((r) => r.kind === "bridge"));
  assert.equal(validateMap(m).errors.length, 0);
  const removed = removeEntity(m, { kind: "crossing", index: 0 });
  assert.equal(removed.crossing, undefined);
  assert.ok(!removed.route.some((r) => r.kind === "bridge"));
});
test("timed fire visuals use the same active window as damage", () => {
  const fire = campfire(1, 2.4, true);
  for (const time of [0, 2.3, 2.5, 4.8, 5.1]) {
    const active = activeHazard(5, time);
    animateFire(fire, time, active);
    assert.equal(fire.userData.active, active);
    assert.ok(
      fire.children
        .filter((c) => ["flame", "spark", "halo"].includes(c.name))
        .every((c) => c.visible === active),
    );
  }
});
for (const level of LEVELS.map((_, i) => i).filter(
  (level) => LEVELS[level].gate,
))
  for (const mode of [1, 2, 3, 6] as const)
    test(`challenge ${level + 1}: ${mode} players can hold the gate without overheating`, () => {
      const g = newGame(mode, level);
      g.keys = LEVELS[level].keys.map((_, i) => i);
      g.savedKeys = [...g.keys];
      const pads = LEVELS[level].pads;
      g.players.forEach((p, i) =>
        Object.assign(p, pads[i % Math.min(mode, pads.length)], {
          heat: 0,
          wetness: 0,
          checkpoint: LEVELS[level].checkpoints.length - 1,
        }),
      );
      const inputs = Object.fromEntries(
        g.players.map((p) => [p.id, { ...idleInput(), shelter: true }]),
      );
      for (let i = 0; i < 250; i++) stepGame(g, inputs);
      assert.equal(g.gateOpen, true);
      assert.ok(g.players.every((p) => p.deaths === 0));
    });
test("new stair route needs separate landings rather than holding jump across it", () => {
  const g = newGame(1, 8),
    p = g.players[0];
  Object.assign(p, { x: 11.4, z: -8, y: 0, checkpoint: 1 });
  let reachedUpper = false;
  for (let i = 0; i < 150; i++) {
    stepGame(g, { 0: { ...idleInput(), axis: 1, jump: true } });
    if (p.x >= 17 && p.y >= 1.3) reachedUpper = true;
  }
  assert.equal(reachedUpper, false);
});

test("round-trip saves, moving-deck transfers and midair corners survive editor export", () => {
  for (const chapter of [30, 34, 36]) {
    const map = CHALLENGE_MAPS[chapter - 9];
    assert.deepEqual(parseMap(JSON.parse(serializeMap(map))), map);
  }
  const transferMap = structuredClone(CHALLENGE_MAPS[36 - 9]);
  const transfer = transferMap.route.find((s) => s.landingId !== undefined)!;
  const shifted = removeEntity(transferMap, { kind: "platforms", index: 0 });
  const shiftedStep = shifted.route.find((s) => s.landingId !== undefined)!;
  assert.equal(shiftedStep.id, transfer.id! - 1);
  assert.equal(shiftedStep.landingId, transfer.landingId! - 1);
  const removed = removeEntity(transferMap, {
    kind: "platforms",
    index: transfer.landingId!,
  });
  assert.ok(!removed.route.some((s) => s.landingId !== undefined));
  const routeIndex = transferMap.route.indexOf(transfer);
  const walk = editEntity(
    transferMap,
    { kind: "route", index: routeIndex },
    { kind: "walk" },
  );
  assert.equal(walk.route[routeIndex].landingId, undefined);
  transfer.landingId = transfer.id;
  assert.match(validateMap(transferMap).errors.join(), /landingId/);
  const malformed = {
    ...CHALLENGE_MAPS[30 - 9],
    level: { ...CHALLENGE_MAPS[30 - 9].level, freeCheckpoints: "yes" },
  };
  assert.match(validateMap(malformed).errors.join(), /freeCheckpoints/);
  const cornerMap = structuredClone(CHALLENGE_MAPS[34 - 9]);
  const corner = cornerMap.route.find((s) => s.via)!;
  corner.via!.x++;
  assert.match(validateMap(cornerMap).errors.join(), /via/);
});

test("new games attach every spawn to its actual platform, regardless of array order", () => {
  for (const firstPlatformMoves of [true, false]) {
    const map = starterMap();
    const deck = {
      ...map.level.platforms[0],
      x: 20,
      motion: { axis: "x" as const, range: 2, period: 6 },
    };
    const floor = map.level.platforms[0];
    map.level.platforms = firstPlatformMoves ? [deck, floor] : [floor, deck];
    map.level.spawn = { x: firstPlatformMoves ? -1 : 19, y: 0, z: 0 };
    const preview = installPreviewMap(map);
    try {
      const game = newGame(3, preview.index);
      const before = game.players.map((p) => p.x);
      stepGame(game, {});
      const movement = firstPlatformMoves
        ? 0
        : platformAt(deck, game.motionTime).x - deck.x;
      game.players.forEach((p, i) => {
        assert.ok(Math.abs(p.x - before[i] - movement) < 1e-10);
        assert.equal(p.support, 1);
      });
    } finally {
      preview.restore();
    }
  }
});

test("stopping a referenced ferry removes obsolete rides and transfers without touching other route steps", () => {
  const map = structuredClone(CHALLENGE_MAPS[36 - 9]);
  syncRoute(map);
  const transfer = map.route.find((s) => s.landingId !== undefined)!;
  for (const platformIndex of [transfer.id!, transfer.landingId!]) {
    const selection = { kind: "platforms" as const, index: platformIndex };
    const edited = editEntity(
      map,
      selection,
      platformMotionPatch(map.level.platforms[platformIndex], false),
    );
    assert.equal(edited.level.platforms[platformIndex].motion, undefined);
    assert.ok(
      !edited.route.some(
        (s) =>
          s.kind === "ferry" &&
          (s.id === platformIndex || s.landingId === platformIndex),
      ),
    );
    assert.deepEqual(
      edited.route.filter((s) => s.kind !== "ferry"),
      map.route.filter((s) => s.kind !== "ferry"),
    );
    assert.ok(
      map.level.platforms[platformIndex].motion,
      "original draft keeps its motion",
    );
    // This operation changes the chapter's mechanism count, so validate as a custom map.
    delete edited.chapter;
    assert.deepEqual(validateMap(edited).errors, []);
  }
});

test("typed editor selections expose actual fields and moving a rain zone never creates a Y coordinate", () => {
  const original = starterMap();
  const { map, selection } = addEntity(original, "zones", { x: 3, y: 4, z: 1 });
  const zone = entity(map, selection);
  assert.equal(zone?.kind, "zones");
  assert.deepEqual(zone?.data, map.weather.zones[0]);
  assert.deepEqual(
    entities(map).map(({ kind }) => kind),
    ["platforms", "awnings", "zones", "route", "spawn", "exit"],
  );
  const moved = moveEntity(map, selection, { x: 7, y: 15, z: -2 });
  assert.deepEqual(moved.weather.zones[0], {
    x: 7,
    z: -2,
    w: 10,
    d: 5,
    rate: 18,
  });
  assert.deepEqual(map.weather.zones[0], { x: 3, z: 1, w: 10, d: 5, rate: 18 });
});
// TypeScript checks this contract even though these intentionally invalid calls are never executed.
function editorTypeContract(map: MapFile, key: Selection<"keys">) {
  // @ts-expect-error a collectible has no platform width
  editEntity(map, key, { w: 3 });
  // @ts-expect-error a paper crossing axis is x or z, never y
  editEntity(map, { kind: "crossing", index: 0 }, { axis: "y" });
  // @ts-expect-error route actions cannot use platform styles
  editEntity(map, { kind: "route", index: 0 }, { kind: "wall" });
}
void editorTypeContract;
