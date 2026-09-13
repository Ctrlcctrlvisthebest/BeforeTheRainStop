import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, type Platform } from "../src/game";
import { WEATHER } from "../src/weather";
import { GUIDE_ROUTES } from "../src/guide";
import { CROSSINGS } from "../src/bridges";
import {
  parseMap,
  starterMap,
  validateMap,
  type MapFile,
} from "../src/map-format";
import { interactiveModules, oversizedGroundRuns } from "../src/map-rules";
import { addEntity } from "../src/editor-model";

const tile = (x = 0, z = 0, w = 4, d = 4, y = 0): Platform => ({
  x,
  z,
  w,
  d,
  y,
  h: 1,
});
function builtIn(index: number): MapFile {
  return {
    format: "before-the-rain-map",
    version: 1,
    chapter: index + 1,
    level: LEVELS[index],
    weather: WEATHER[index],
    route: GUIDE_ROUTES[index],
    crossing: CROSSINGS[index],
  };
}
for (let index = 0; index < LEVELS.length; index++)
  test(`chapter ${index + 1} meets both authored-map rules`, () => {
    const map = builtIn(index);
    assert.deepEqual(validateMap(map, index + 1).errors, []);
    if (index >= 10) assert.ok(interactiveModules(map).length >= 2);
  });
test("the inclusive size limit covers every physical platform kind and gate", () => {
  for (const kind of [
    undefined,
    "wall",
    "step",
    "moving",
    "low-roof",
    "railing",
  ] as const)
    for (const axis of ["w", "d"] as const) {
      const m = starterMap();
      m.level.platforms = [
        {
          ...tile(0, 0, 9, 9),
          kind,
          ...(kind === "moving"
            ? { motion: { axis: "x" as const, range: 2, period: 5 } }
            : {}),
        },
      ];
      assert.deepEqual(validateMap(m).errors, []);
      m.level.platforms[0][axis] = 9.001;
      assert.ok(
        validateMap(m).errors.some((e) => e.startsWith(`platforms[0].${axis}`)),
      );
      assert.throws(() => parseMap(m));
    }
  const m = starterMap();
  m.level.gate = { ...tile(), d: 10 };
  m.level.pads = [{ x: 0, y: 0, z: 0 }];
  assert.ok(validateMap(m).errors.some((e) => e.startsWith("gate.d")));
  m.level.gate.d = 9;
  m.weather.zones = [{ x: 0, z: 0, w: 30, d: 30, rate: 12 }];
  m.weather.awnings[0].w = 12;
  assert.deepEqual(
    validateMap(m).errors,
    [],
    "rain and shelter footprints are not collision platforms",
  );
});
test("floor union catches adjoining and overlapping tiles, thin slivers and fake seams", () => {
  for (const offset of [4.1, 5, 5.2, 5.799]) {
    assert.ok(
      oversizedGroundRuns([tile(0, 0, 5, 3), tile(offset, 0, 5, 3)]).length,
      `offset ${offset}`,
    );
  }
  assert.ok(
    oversizedGroundRuns([tile(0, 0, 5, 3), tile(4.5, 2.99, 5, 3)]).length,
    "all cross-section bands, not just tile centres",
  );
  assert.ok(
    oversizedGroundRuns([tile(0, 0, 5, 3), tile(5, 0, 5, 3, 0.05)]).length,
    "a tiny raised seam is still walkable",
  );
  for (const kind of ["wall", "low-roof", "railing"] as const)
    assert.ok(
      oversizedGroundRuns([
        { ...tile(0, 0, 5, 3), kind },
        { ...tile(5, 0, 5, 3), kind },
      ]).length,
      "kind labels cannot bypass surface rules",
    );
  const map = starterMap();
  map.level.platforms = [tile(0, 0, 5, 3), tile(5, 0, 5, 3)];
  assert.throws(() => parseMap(map), /连续地面/);
});
test("short turns, real gaps, and separate height tiers remain valid", () => {
  assert.deepEqual(
    oversizedGroundRuns([tile(0, 0, 5, 3), tile(6, 0, 5, 3)]),
    [],
  );
  assert.deepEqual(
    oversizedGroundRuns([tile(0, 0, 5, 3), tile(5, 0, 5, 3, 0.8)]),
    [],
  );
  assert.deepEqual(
    oversizedGroundRuns([
      tile(0, 0, 8, 3),
      tile(2.5, -4, 3, 5),
      tile(5, -5, 8, 3),
    ]),
    [],
    "an L/S route can extend across a large bounding box",
  );
  assert.ok(
    oversizedGroundRuns([tile(0, 0, 3, 6), tile(0, -6, 3, 6)]).some(
      (r) => r.axis === "z",
    ),
  );
});
test("chapter 10 boundary, registration slot, metadata and editor export are enforced", () => {
  const m = starterMap();
  m.chapter = 10;
  assert.doesNotThrow(() => parseMap(m, 10));
  m.chapter = 11;
  assert.throws(() => parseMap(m), /至少需要 2/);
  delete m.chapter;
  assert.throws(() => parseMap(m, 11), /至少需要 2/);
  m.chapter = 1;
  assert.throws(() => parseMap(m, 11), /不一致/);
  assert.equal(parseMap({ ...starterMap(), chapter: 10 }).chapter, 10);
  const { map } = addEntity(starterMap(), "crossing", { x: 18, y: 0, z: 0 });
  assert.deepEqual(
    validateMap(map).errors,
    [],
    "the editor bridge component never creates oversized roofs or rails",
  );
});
test("two distinct mechanisms may have the same type; repeated visits and shared gate plates count once", () => {
  assert.equal(
    interactiveModules(builtIn(13)).filter((m) => m.kind === "wind").length,
    3,
  );
  assert.equal(
    interactiveModules(builtIn(14)).filter((m) => m.kind === "ferry").length,
    3,
  );
  const m = structuredClone(builtIn(18));
  assert.equal(m.route.filter((s) => s.kind === "ferry").length, 2);
  assert.equal(m.level.pads.length, 2);
  assert.equal(interactiveModules(m).length, 2);
  m.route = m.route.filter((s) => s.kind !== "pads");
  assert.equal(interactiveModules(m).length, 1);
  assert.ok(validateMap(m).errors.some((e) => e.includes("当前 1 个")));
});
test("unused objects, nonreferenced winds and duplicate geometry cannot inflate the count", () => {
  const m = starterMap();
  m.chapter = 11;
  m.level.winds = [{ x: 30, y: 0, z: 0, w: 2, d: 2, height: 6 }];
  m.level.platforms.push({
    ...tile(20),
    motion: { axis: "x", range: 2, period: 5 },
  });
  m.level.pads = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  ];
  m.level.gate = tile(3, 0, 0.5, 3, 3.8);
  assert.equal(interactiveModules(m).length, 0);
  m.route.unshift({
    kind: "wind",
    view: 0,
    from: { x: 0, y: 0, z: 0 },
    target: { x: 3, y: 3, z: 0 },
  });
  assert.equal(interactiveModules(m).length, 0);
  const ferry = {
    kind: "ferry" as const,
    view: 0 as const,
    id: 1,
    target: { x: 25, y: 0, z: 0 },
  };
  m.route.unshift(ferry, structuredClone(ferry));
  m.level.platforms.push(structuredClone(m.level.platforms[1]));
  m.route.unshift({ ...ferry, id: 2 });
  assert.equal(interactiveModules(m).length, 1);
  const winds = structuredClone(builtIn(13));
  winds.level.winds = [
    winds.level.winds[0],
    structuredClone(winds.level.winds[0]),
  ];
  winds.route = [
    winds.route[0],
    structuredClone(winds.route[0]),
    winds.route.at(-1)!,
  ];
  assert.equal(interactiveModules(winds).length, 1);
});
