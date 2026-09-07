import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { KeyboardInput, bindGameKeyboard } from "../src/keyboard-input";
import { idleInput, LEVELS, newGame } from "../src/game";
import {
  parseMap,
  starterMap,
  MAP_LIMITS,
  validateMap,
} from "../src/map-format";
import {
  addEntity,
  duplicateEntity,
  editEntity,
  removeEntity,
  type Selection,
} from "../src/editor-model";
import { bankPoint, CROSSINGS } from "../src/bridges";
import { installPreviewMap } from "../src/preview-map";
import { WEATHER, CAMPFIRES, BLAZE_ROOFS } from "../src/weather";
import { GUIDE_ROUTES } from "../src/guide";
import { disposeObjectTree, platformVisual } from "../src/scene-resources";
import { save, stored, forget } from "../src/storage";

test("keyboard aliases do not outweigh the opposite direction or release each other", () => {
  const keyboard = new KeyboardInput();
  keyboard.down("ArrowLeft", 0);
  keyboard.down("KeyA", 0);
  keyboard.down("KeyD", 0);
  assert.equal(keyboard.read(0).axis, 0);
  keyboard.up("KeyD", 1);
  keyboard.up("KeyA", 1);
  assert.equal(keyboard.read(1).axis, -1);
  keyboard.up("ArrowLeft", 2);
  assert.deepEqual(keyboard.read(2), idleInput());
});
for (const [code, field] of [
  ["KeyQ", "turn"],
  ["Space", "jump"],
  ["KeyR", "reset"],
] as const)
  test(`a quick ${code} tap survives a network tick and then expires`, () => {
    const keyboard = new KeyboardInput();
    keyboard.down(code, 0);
    keyboard.up(code, 10);
    assert.equal(keyboard.read(50)[field], true);
    assert.equal(keyboard.read(120)[field], false);
  });
for (const [code, field] of [
  ["ShiftLeft", "fold"],
  ["KeyS", "shelter"],
  ["KeyF", "repair"],
] as const)
  test(`${code} releases immediately without a delayed transformation`, () => {
    const keyboard = new KeyboardInput();
    keyboard.down(code, 0);
    keyboard.up(code, 1);
    assert.equal(keyboard.read(1)[field], false);
  });
test("pause clears held keys and pulses; auto-repeat cannot revive them after resume", () => {
  const keyboard = new KeyboardInput();
  keyboard.down("KeyD", 0);
  keyboard.down("KeyQ", 0);
  keyboard.up("KeyQ", 1);
  keyboard.clear();
  keyboard.down("KeyD", 50, true);
  keyboard.down("Space", 50);
  assert.deepEqual(keyboard.read(50), { ...idleInput(), jump: true });
  keyboard.clear();
  keyboard.up("KeyD", 60);
  assert.deepEqual(keyboard.read(60), idleInput());
  assert.equal(keyboard.down("toString", 60), false);
});

test("unknown imported properties cannot override coordinates or activate inspectors", () => {
  const map = starterMap();
  Object.assign(map.level.platforms[0], {
    target: { x: "bad" },
    privateData: "unused",
  });
  map.level.keys.push({ x: 1, y: 0.7, z: 0 });
  Object.assign(map.level.keys[0], { motion: { axis: {} } });
  const parsed = parseMap(map);
  assert.equal("target" in parsed.level.platforms[0], false);
  assert.equal("privateData" in parsed.level.platforms[0], false);
  assert.equal("motion" in parsed.level.keys[0], false);
  parsed.level.platforms[0].x = 99;
  assert.equal(
    map.level.platforms[0].x,
    4,
    "imported maps are independent copies",
  );
});
test("malformed map values fail with validation errors instead of exceptions", () => {
  const bad = [
    null,
    false,
    1,
    "",
    [],
    {},
    { format: "before-the-rain-map", version: 1 },
  ];
  for (const value of bad) assert.ok(validateMap(value).errors.length);
  for (const path of [
    "platforms",
    "keys",
    "pads",
    "checkpoints",
    "hazards",
    "winds",
  ] as const) {
    for (const value of [null, {}, "wrong", [null], [1]]) {
      const map = starterMap();
      Object.assign(map.level, { [path]: value });
      assert.ok(
        validateMap(map).errors.length,
        `${path}: ${JSON.stringify(value)}`,
      );
      assert.throws(() => parseMap(map));
    }
  }
});
test("duplicate terminal steps and invalid references are rejected on import", () => {
  const map = starterMap();
  map.route.unshift(structuredClone(map.route.at(-1)!));
  assert.throws(() => parseMap(map), /只能出现一次/);
  map.route.shift();
  map.route.unshift({
    kind: "ferry",
    target: map.level.spawn,
    view: 0,
    id: 999,
  });
  assert.throws(() => parseMap(map), /引用对象不存在/);
});
test("stale selections cannot delete the last object or crash duplication", () => {
  const map = starterMap();
  for (const index of [-1, 0.5, 999, NaN]) {
    const selection: Selection = { kind: "platforms", index };
    assert.equal(removeEntity(map, selection), map);
    assert.equal(duplicateEntity(map, selection).map, map);
    assert.equal(editEntity(map, selection, { x: 3 }), map);
  }
  const exit: Selection = { kind: "route", index: map.route.length - 1 };
  map.route.at(-1)!.view = 1;
  assert.equal(removeEntity(map, exit), map);
  assert.equal(editEntity(map, exit, { kind: "walk" }), map);
  assert.equal(map.route.at(-1)!.view, 1);
});
test("adding a gate creates its guide; removing it clears only that guide", () => {
  const map = addEntity(starterMap(), "gate", { x: 6, y: 0, z: 0 }).map;
  assert.equal(map.level.pads.length, 2);
  assert.equal(map.route.filter((r) => r.kind === "pads").length, 1);
  assert.equal(map.route.at(-1)!.kind, "exit");
  const moved = editEntity(map, { kind: "pads", index: 0 }, { x: 2 });
  assert.equal(moved.route.find((r) => r.kind === "pads")!.target.x, 2);
  const removed = removeEntity(moved, { kind: "gate", index: 0 });
  assert.equal(
    removed.route.some((r) => r.kind === "pads"),
    false,
  );
  assert.equal(removed.level.pads.length, 2);
});
test("changing a route action drops obsolete references and prerequisites", () => {
  const map = starterMap();
  map.route.unshift({
    kind: "ferry",
    target: map.level.spawn,
    view: 0,
    id: 0,
    requiredKey: 0,
  });
  const edited = editEntity(map, { kind: "route", index: 0 }, { kind: "walk" });
  assert.equal("requiredKey" in edited.route[0], false);
  assert.equal("id" in edited.route[0], false);
  assert.doesNotThrow(() => parseMap(edited));
});
test("editing a bridge moves its guide to the actual far bank and correct view", () => {
  let map = addEntity(starterMap(), "crossing", { x: 20, y: 2, z: 0 }).map;
  map = editEntity(
    map,
    { kind: "crossing", index: 0 },
    { axis: "z", near: 1, z: -4 },
  );
  const route = map.route.find((r) => r.kind === "bridge")!;
  assert.deepEqual(route.target, bankPoint(map.crossing!, -1));
  assert.equal(route.view, 1);
});
test("add and duplicate enforce caps atomically, including generated component parts", () => {
  const map = starterMap();
  map.level.pads = [
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
  ];
  assert.throws(
    () => duplicateEntity(map, { kind: "pads", index: 0 }),
    /最多 2/,
  );
  assert.throws(() => addEntity(map, "pads", map.level.spawn), /最多 2/);
  assert.equal(map.level.pads.length, 2);
  assert.throws(() => addEntity(map, "select", map.level.spawn), /选择/);
  const crossing = addEntity(map, "crossing", { x: 20, y: 0, z: 0 }).map;
  assert.throws(() => addEntity(crossing, "crossing", map.level.spawn), /一处/);
  map.level.platforms = Array.from(
    { length: MAP_LIMITS.platforms - 4 },
    () => ({ ...map.level.platforms[0] }),
  );
  assert.throws(
    () => addEntity(map, "crossing", { x: 20, y: 0, z: 0 }),
    /最多 180/,
  );
  assert.equal(map.level.platforms.length, MAP_LIMITS.platforms - 4);
});
test("preview cleanup restores every registry and supports repeated restart or failure", () => {
  const registries = [
    LEVELS,
    WEATHER,
    CAMPFIRES,
    BLAZE_ROOFS,
    GUIDE_ROUTES,
    CROSSINGS,
  ];
  const before = structuredClone(registries);
  const levelCount = LEVELS.length;
  for (let i = 0; i < 3; i++) {
    const map =
      i % 2
        ? addEntity(starterMap(), "crossing", { x: 20, y: 2, z: 0 }).map
        : starterMap();
    const preview = installPreviewMap(map);
    assert.equal(newGame(1, preview.index).level, levelCount);
    preview.restore();
    preview.restore();
    assert.deepEqual(registries, before);
  }
});
test("cutaway roofs and rails preserve their collision base at elevated bridge heights", () => {
  const p = {
    x: 0,
    z: 0,
    w: 10,
    d: 3,
    y: 14,
    h: 10.99,
    kind: "low-roof" as const,
  };
  const visual = platformVisual(p);
  assert.ok(Math.abs(visual.y - 3.19) < 0.00001);
  assert.ok(Math.abs(visual.y - visual.h - (p.y - p.h)) < 0.00001);
  assert.equal(platformVisual({ ...p, kind: "railing", h: 12 }).y, 3.1);
});
test("shared geometry, material and textures are each disposed once, including lines", () => {
  const root = new THREE.Group(),
    geometry = new THREE.BoxGeometry(),
    texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    normalMap: texture,
  });
  const sprite = new THREE.SpriteMaterial({ map: texture });
  root.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
    new THREE.Line(geometry, material),
    new THREE.Sprite(sprite),
  );
  const counts = [0, 0, 0, 0];
  [geometry, texture, material, sprite].forEach((resource, i) =>
    resource.addEventListener("dispose", () => counts[i]++),
  );
  disposeObjectTree(root);
  assert.deepEqual(counts, [1, 1, 1, 1]);
});
test("blocked storage getters, quota errors and corrupt preferences never stop gameplay", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    assert.equal(stored("local", "key"), null);
    assert.doesNotThrow(() => {
      save("local", "key", 1);
      forget("local", "key");
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => "broken-json",
        setItem() {
          throw new Error("quota");
        },
        removeItem() {},
      },
    });
    assert.equal(stored("local", "key"), null);
    assert.doesNotThrow(() => save("local", "key", 1));
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("keyboard listeners ignore paused input and are fully removed on cleanup", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const windowTarget = new EventTarget(),
    documentTarget = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowTarget,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentTarget,
  });
  const keyboard = new KeyboardInput();
  let enabled = false,
    escapes = 0;
  const unbind = bindGameKeyboard(keyboard, {
    enabled: () => enabled,
    escape: () => escapes++,
  });
  const key = (type: string, code: string, repeat = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat });
    windowTarget.dispatchEvent(event);
  };
  try {
    key("keydown", "KeyD");
    assert.equal(keyboard.read(performance.now()).axis, 0);
    enabled = true;
    key("keydown", "KeyD");
    assert.equal(keyboard.read(performance.now()).axis, 1);
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    key("keydown", "KeyD", true);
    assert.equal(keyboard.read(performance.now()).axis, 0);
    key("keyup", "KeyD");
    key("keydown", "KeyD");
    key("keydown", "Escape");
    key("keydown", "Escape", true);
    assert.equal(escapes, 1);
    assert.deepEqual(keyboard.read(performance.now()), idleInput());
    unbind();
    key("keydown", "KeyD");
    assert.deepEqual(keyboard.read(performance.now()), idleInput());
  } finally {
    unbind();
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("map field mutation matrix cannot crash validation, even with hostile reference objects", () => {
  let map = starterMap();
  for (const tool of [
    "keys",
    "stars",
    "checkpoints",
    "signs",
    "gate",
    "winds",
    "hazards",
    "moving",
    "crossing",
  ] as const)
    map = addEntity(map, tool, { x: 20, y: 0, z: 0 }).map;
  map.route.unshift({
    kind: "ferry",
    target: { x: 20, y: 0, z: 0 },
    view: 0,
    id: 1,
    requiredKey: 0,
  });
  map.translations = { 我的雨中小径: "My path" };
  const paths: string[][] = [];
  const visit = (value: unknown, path: string[]) => {
    paths.push(path);
    if (value && typeof value === "object")
      for (const [key, child] of Object.entries(value))
        visit(child, [...path, key]);
  };
  visit(map, []);
  const invalid: unknown[] = [
    null,
    true,
    -999,
    Infinity,
    "bad",
    [],
    {},
    { toString: null, valueOf: null },
  ];
  for (const path of paths.filter((p) => p.length))
    for (const replacement of invalid) {
      const mutated = structuredClone(map);
      let parent: any = mutated;
      for (const key of path.slice(0, -1)) parent = parent[key];
      parent[path.at(-1)!] = replacement;
      assert.doesNotThrow(
        () => {
          const report = validateMap(mutated);
          if (!report.errors.length)
            assert.deepEqual(validateMap(parseMap(mutated)).errors, []);
        },
        `invalid value at ${path.join(".")}`,
      );
    }
  assert.ok(paths.length * invalid.length > 1000);
});
