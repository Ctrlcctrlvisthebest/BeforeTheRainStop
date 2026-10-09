import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PaperScene } from "../src/scene";
import { LEVELS, newGame } from "../src/game";
import { AdaptiveQuality } from "../src/render-quality";
import { SceneryOcclusion } from "../src/scenery-occlusion";
import { translate } from "../src/i18n";
import { touchCopy } from "../src/mobile";
import { editionCopy } from "../src/edition-copy";

// Exercise real scene construction, camera/update logic and resource teardown.
// Only GPU submission and canvas drawing are replaced; this is not a GPU test.
function fixture() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => {
        const canvas = { width: 0, height: 0, text: "", getContext: () => ctx };
        const ctx = new Proxy(
          {
            clearRect: () => {
              canvas.text = "";
            },
            fillText: (text: string) => {
              canvas.text = text;
            },
          },
          { get: (target, key) => Reflect.get(target, key) ?? (() => {}) },
        );
        return canvas;
      },
    },
  });
  Object.defineProperty(globalThis, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const previousFrame = Object.getOwnPropertyDescriptor(
    globalThis,
    "requestAnimationFrame",
  );
  const previousCancel = Object.getOwnPropertyDescriptor(
    globalThis,
    "cancelAnimationFrame",
  );
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (id: number) => frames.delete(id),
  });
  const calls: string[] = [];
  const view = Object.create(PaperScene.prototype) as PaperScene;
  const root = new THREE.Group(),
    scene = new THREE.Scene();
  scene.add(root);
  Object.assign(view, {
    scene,
    root,
    backdrop: new THREE.Group(),
    sceneryOcclusion: new SceneryOcclusion(),
    visibilitySubjects: [],
    camera: new THREE.OrthographicCamera(),
    birds: [],
    rain: null,
    windLeaves: null,
    reducedMotion: { matches: false },
    tiles: [],
    terrainEdges: null,
    keys: [],
    stars: [],
    pads: [],
    crossingDeck: null,
    crossingPad: null,
    crossingLabel: null,
    bridgeSockets: [],
    mechanismCards: new Map(),
    hazards: [],
    fires: [],
    litFire: null,
    fireLight: new THREE.PointLight("#ffad5b", 0, 6, 2),
    gate: null,
    gateLabel: null,
    portal: new THREE.Group(),
    exitGlow: null,
    guideMarker: new THREE.Group(),
    signs: [],
    level: -1,
    count: 0,
    yaw: 0,
    target: new THREE.Vector3(4, 1, 0),
    initialized: false,
    width: 1000,
    height: 600,
    clock: 0,
    gameId: "",
    language: "zh",
    compact: false,
    textLabels: [],
    disposed: false,
    preparationRevision: 0,
    preparationWaiters: new Map(),
    wishes: [],
    labels: [],
    movingPlatforms: [],
    scratch: new THREE.Vector3(),
    goal: new THREE.Vector3(),
    wetColor: new THREE.Color("#586f82"),
    heatColor: new THREE.Color("#553725"),
    sun: new THREE.DirectionalLight(),
    quality: new AdaptiveQuality(),
    coarsePointer: false,
    contextRecovery: {
      lost: false,
      dispose: () => calls.push("context-disposed"),
    },
    resize: { disconnect: () => calls.push("observer-disconnected") },
    renderer: {
      compile: () => calls.push("compile"),
      render: () => calls.push("draw"),
      dispose: () => calls.push("renderer-disposed"),
    },
  });
  return {
    view,
    root,
    calls,
    frame: async () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
      await Promise.resolve();
    },
    internals: view as unknown as {
      textLabels: { sprite: THREE.Sprite; source: string; shorten: boolean }[];
      clock: number;
      contextRecovery: { lost: boolean };
      interruptPreparation: () => void;
    },
    close: () => {
      view.dispose();
      if (previous) Object.defineProperty(globalThis, "document", previous);
      else Reflect.deleteProperty(globalThis, "document");
      Reflect.deleteProperty(globalThis, "devicePixelRatio");
      if (previousFrame)
        Object.defineProperty(
          globalThis,
          "requestAnimationFrame",
          previousFrame,
        );
      else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
      if (previousCancel)
        Object.defineProperty(
          globalThis,
          "cancelAnimationFrame",
          previousCancel,
        );
      else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
    },
  };
}

function resources(root: THREE.Object3D) {
  const ids: string[] = [];
  root.traverse((node) => {
    ids.push(node.uuid);
    if (
      node instanceof THREE.Mesh ||
      node instanceof THREE.Line ||
      node instanceof THREE.Points
    )
      ids.push(node.geometry.uuid);
    if (
      node instanceof THREE.Sprite ||
      node instanceof THREE.Mesh ||
      node instanceof THREE.Line ||
      node instanceof THREE.Points
    ) {
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        ids.push(material.uuid);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) ids.push(value.uuid);
      }
    }
  });
  return ids;
}

test("preparation builds/compiles/draws before play without advancing game or visual clocks", async () => {
  const f = fixture(),
    game = newGame(6, 37),
    before = structuredClone(game);
  try {
    const prepared = f.view.prepare(
      game,
      0,
      false,
      "en",
      LEVELS[37].exit,
      true,
    );
    assert.deepEqual(
      f.calls,
      [],
      "loading gets a frame before costly construction",
    );
    await f.frame();
    assert.deepEqual(f.calls, ["compile"]);
    assert.ok(
      f.root.children.length > 100,
      "build takes place before compilation/readiness",
    );
    assert.deepEqual(game, before);
    assert.equal(f.internals.clock, 0);
    await f.frame();
    assert.equal(await prepared, true);
    assert.deepEqual(f.calls, ["compile", "draw"]);
    assert.deepEqual(game, before, "warm draw cannot simulate hidden rain");
    assert.equal(f.internals.clock, 0);
  } finally {
    f.close();
  }
});

test("every map keeps terrain/birds/lights/textures while translating all landmark labels and changing compact layout", async () => {
  const f = fixture();
  try {
    for (let level = 0; level < LEVELS.length; level++) {
      const game = newGame(1, level);
      const pending = f.view.prepare(game, 0, false, "zh", LEVELS[level].exit);
      await f.frame();
      await f.frame();
      await pending;
      f.view.render(game, 0, 0.01);
      const ids = resources(f.root),
        clock = f.internals.clock;
      const labels = f.internals.textLabels;
      assert.ok(labels.length >= LEVELS[level].signs.length + 1);
      f.view.render(game, 0, 0, false, "en", LEVELS[level].spawn, true);
      assert.deepEqual(
        resources(f.root),
        ids,
        `level ${level + 1}: no resource replacement`,
      );
      assert.equal(f.internals.textLabels, labels);
      assert.equal(
        f.internals.clock,
        clock,
        "language doesn't reset animation state",
      );
      for (const { sprite, source, shorten } of labels) {
        const translated = translate(
          "en",
          shorten ? editionCopy(source) : source,
        );
        const expected = shorten ? touchCopy(translated, "en") : translated;
        assert.equal(
          (sprite.material.map!.image as { text: string }).text,
          expected,
        );
      }
      f.view.render(game, 0, 0, false, "zh", LEVELS[level].exit, false);
      assert.deepEqual(resources(f.root), ids);
    }
  } finally {
    f.close();
  }
});

test("leaving during preparation immediately cancels readiness and releases resources exactly once", async () => {
  const f = fixture();
  try {
    const pending = f.view.prepare(newGame(1, 0), 0);
    await f.frame();
    const resource = f.root.children.find(
      (node) =>
        node instanceof THREE.Group && node.children[0] instanceof THREE.Mesh,
    )!.children[0] as THREE.Mesh;
    let disposals = 0;
    resource.geometry.addEventListener("dispose", () => disposals++);
    f.view.dispose();
    f.view.dispose();
    assert.equal(
      await pending,
      false,
      "does not wait for another RAF, GPU poll or 30 second timeout",
    );
    await f.frame();
    assert.equal(f.calls.includes("draw"), false);
    assert.equal(
      f.calls.filter((call) => call === "renderer-disposed").length,
      1,
    );
    assert.equal(disposals, 1);
    f.view.render(newGame(1, 0), 0, 0);
    assert.equal(f.calls.includes("draw"), false);
  } finally {
    f.close();
  }
});

test("loss between compilation and warm draw cancels immediately and a new context prepares normally", async () => {
  const f = fixture();
  try {
    const game = newGame(1, 0),
      pending = f.view.prepare(game, 0);
    await f.frame();
    assert.equal(f.calls.includes("compile"), true);
    f.internals.contextRecovery.lost = true;
    f.internals.interruptPreparation();
    assert.equal(await pending, false);
    assert.equal(f.calls.includes("draw"), false);
    assert.equal(await f.view.prepare(game, 0), false);
    f.internals.contextRecovery.lost = false;
    const restored = f.view.prepare(game, 0);
    await f.frame();
    await f.frame();
    assert.equal(await restored, true);
    assert.equal(f.calls.filter((call) => call === "draw").length, 1);
  } finally {
    f.close();
  }
});

test("a newer map preparation retires the previous request before it can rebuild/draw the old map", async () => {
  const f = fixture();
  try {
    const first = f.view.prepare(newGame(1, 0), 0);
    const last = f.view.prepare(newGame(6, 39), 0);
    assert.equal(await first, false);
    await f.frame();
    await f.frame();
    assert.equal(await last, true);
    assert.deepEqual(f.calls, ["compile", "draw"]);
    assert.equal(
      f.root.children.filter((node) => !!node.getObjectByName("bird")).length,
      6,
    );
  } finally {
    f.close();
  }
});
