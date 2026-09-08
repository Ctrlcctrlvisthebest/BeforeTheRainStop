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
} from "../src/editor-model";
import { campfire, animateFire } from "../src/fire-scene";

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
  assert.equal(CHALLENGE_MAPS.length, 9);
});
test("invalid imports fail cleanly before replacing a draft or running physics", () => {
  const valid = starterMap();
  for (const change of [
    (m: any) => (m.version = 2),
    (m: any) => (m.level.platforms[0].w = -1),
    (m: any) =>
      (m.weather.zones = [{ x: 0, z: 0, w: 4, d: 4, rate: Infinity }]),
    (m: any) => (m.route = { length: 1 }),
    (m: any) => (m.level.spawn = null),
    (m: any) =>
      (m.route = [
        { kind: "ferry", id: 0, target: { x: 0, y: 0, z: 0 }, view: 0 },
        { kind: "exit", target: { x: 9, y: 0, z: 0 }, view: 0 },
      ]),
  ]) {
    const bad = structuredClone(valid);
    change(bad);
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
for (const level of [10, 11, 12, 13, 14, 15, 16])
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
