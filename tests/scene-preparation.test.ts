import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PaperScene } from "../src/scene";
import { idleInput, LEVELS, newGame, stepGame } from "../src/game";
import { AdaptiveQuality } from "../src/render-quality";
import { SceneryOcclusion } from "../src/scenery-occlusion";
import { translate } from "../src/i18n";
import { touchCopy } from "../src/mobile";
import { editionCopy } from "../src/edition-copy";
import { TEXT_SIZE_FACTORS } from "../src/text-size";
import { SPRITE_FONT_HEIGHT, type TextSprite } from "../src/scene-text";
import { MechanismCard, MECHANISM_CARD_ASPECT } from "../src/mechanism-scene";
import { CROSSINGS, bankPoint } from "../src/bridges";

// Exercise real scene construction, camera/update logic and resource teardown.
// Only GPU submission and canvas drawing are replaced; this is not a GPU test.
function fixture(width = 1000, height = 600) {
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
              canvas.text += text;
            },
            measureText: (text: string) => ({ width: [...text].length * 16 }),
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
    scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera();
  scene.add(root);
  Object.assign(view, {
    scene,
    root,
    backdrop: new THREE.Group(),
    sceneryOcclusion: new SceneryOcclusion(),
    visibilitySubjects: [],
    camera,
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
    width,
    height,
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
    textPoint: new THREE.Vector3(),
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
    camera,
    calls,
    frame: async () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
      await Promise.resolve();
    },
    internals: view as unknown as {
      textLabels: { sprite: TextSprite; source: string; shorten: boolean }[];
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

test("small movements, turns and ordinary jumps keep the camera still in both views and screen shapes", () => {
  for (const [width, height] of [
    [1000, 600],
    [390, 844],
  ]) {
    for (const view of [0, 1] as const) {
      const f = fixture(width, height),
        game = newGame(1, 0),
        player = game.players[0],
        start = { x: player.x, y: player.y, z: player.z };
      try {
        game.view = view;
        f.view.render(game, 0, 0);
        const position = f.camera.position.clone(),
          rotation = f.camera.quaternion.clone();
        for (let frame = 0; frame < 60; frame++) {
          player.x = start.x + Math.sin(frame / 5) * 1.5;
          player.z = start.z + Math.cos(frame / 5) * 1.5;
          player.facing = frame % 2 ? -1 : 1;
          f.view.render(game, 0, 1 / 60);
          assert.deepEqual(f.camera.position, position);
          assert.ok(f.camera.quaternion.equals(rotation));
        }
        Object.assign(player, start);
        let peak = player.y;
        for (let frame = 0; frame < 90; frame++) {
          stepGame(game, { 0: { ...idleInput(), jump: frame === 0 } });
          peak = Math.max(peak, player.y);
          f.view.render(game, 0, 1 / 60);
          assert.deepEqual(f.camera.position, position);
          assert.ok(f.camera.quaternion.equals(rotation));
        }
        assert.ok(peak > start.y + 1, "a real jump took place");
      } finally {
        f.close();
      }
    }
  }
});

test("long travel follows smoothly, nearby reversals stay put and Q preserves the new view's tracking", () => {
  const f = fixture(),
    game = newGame(1, 0),
    player = game.players[0];
  const renderFrames = (count: number) => {
    for (let frame = 0; frame < count; frame++) f.view.render(game, 0, 1 / 60);
  };
  try {
    f.view.render(game, 0, 0);
    const start = f.camera.position.clone();
    player.x += 8;
    renderFrames(1);
    assert.ok(f.camera.position.x > start.x);
    assert.ok(f.camera.position.x < player.x, "follow starts smoothly");
    renderFrames(240);
    const settled = f.camera.position.clone();
    assert.ok(settled.x > start.x + 3, "long travel moved the camera");
    assert.ok(
      player.x - settled.x > 1,
      "stopping does not recenter the player",
    );
    player.x -= 1.5;
    player.facing = -1;
    renderFrames(120);
    player.x += 0.5;
    renderFrames(120);
    assert.ok(f.camera.position.distanceTo(settled) < 1e-7);

    const direction = f.camera.getWorldDirection(new THREE.Vector3());
    game.view = 1;
    renderFrames(240);
    const turned = f.camera.position.clone(),
      turnedDirection = f.camera.getWorldDirection(new THREE.Vector3());
    assert.ok(Math.abs(turnedDirection.x) > 0.9);
    assert.ok(Math.abs(turnedDirection.z) < 1e-7);
    assert.ok(Math.abs(turnedDirection.y - direction.y) < 1e-7);
    assert.ok(Math.abs(turned.y - settled.y) < 1e-7);
    assert.ok(
      Math.abs(turned.x + turned.z - settled.x - settled.z) < 1e-7,
      "turning orbits the existing focus instead of recentering it",
    );
    player.z -= 8;
    renderFrames(1);
    assert.ok(f.camera.position.z < turned.z);
    assert.ok(f.camera.position.z > player.z);
    renderFrames(240);
    assert.ok(f.camera.position.z < turned.z - 3);
    assert.ok(Math.abs(f.camera.position.x - turned.x) < 1e-7);

    const beforeClimb = f.camera.position.y;
    player.y += 6;
    renderFrames(1);
    assert.ok(f.camera.position.y > beforeClimb);
    renderFrames(240);
    assert.ok(f.camera.position.y > beforeClimb + 2);
  } finally {
    f.close();
  }
});

test("multiplayer follows the local slot and a new level immediately resets its framing", () => {
  const f = fixture(),
    game = newGame(2, 0),
    local = game.players[1];
  try {
    Object.assign(local, { x: 8, y: 2, z: -4 });
    f.view.render(game, 1, 0);
    const start = f.camera.position.clone(),
      offset = start.clone().sub(new THREE.Vector3(local.x, local.y, local.z));
    assert.equal(start.x, local.x);
    game.players[0].x += 30;
    for (let frame = 0; frame < 90; frame++) f.view.render(game, 1, 1 / 60);
    assert.deepEqual(
      f.camera.position,
      start,
      "the remote player cannot drag the camera",
    );
    local.x += 8;
    f.view.render(game, 1, 1 / 60);
    assert.ok(f.camera.position.x > start.x);

    const next = newGame(1, 47),
      spawn = next.players[0];
    f.view.render(next, 0, 0);
    const expected = new THREE.Vector3(spawn.x, spawn.y, spawn.z).add(offset);
    assert.ok(f.camera.position.distanceTo(expected) < 1e-10);
  } finally {
    f.close();
  }
});

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

test("every map keeps terrain/birds/lights/textures while translating, resizing labels and changing compact layout", async () => {
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
          (sprite.material.map!.image as { text: string }).text.replace(
            /\s+/g,
            "",
          ),
          expected.replace(/\s+/g, ""),
        );
      }
      f.view.render(game, 0, 0, false, "zh", LEVELS[level].exit, false);
      assert.deepEqual(resources(f.root), ids);
      const base = labels.map(({ sprite }) => sprite.scale.clone());
      const versions = labels.map(({ sprite }) => sprite.material.map!.version);
      const before = structuredClone(game);
      for (const size of ["large", "largest", "standard"] as const) {
        f.view.render(game, 0, 0, false, "zh", LEVELS[level].exit, false, size);
        labels.forEach(({ sprite }, index) => {
          assert.ok(
            Math.abs(sprite.scale.x - base[index].x * TEXT_SIZE_FACTORS[size]) <
              1e-10,
          );
          assert.ok(
            Math.abs(sprite.scale.y - base[index].y * TEXT_SIZE_FACTORS[size]) <
              1e-10,
          );
        });
        assert.deepEqual(
          labels.map(({ sprite }) => sprite.material.map!.version),
          versions,
          "resizing reuses the rasterized text without another texture upload",
        );
        assert.deepEqual(resources(f.root), ids);
        assert.deepEqual(game, before);
        assert.equal(f.internals.clock, clock);
      }
    }
  } finally {
    f.close();
  }
});

test("phone landmark text keeps a readable pixel size and visible ink stays in the viewport", () => {
  const f = fixture(320, 100);
  try {
    const game = newGame(1);
    for (const size of ["standard", "large", "largest"] as const) {
      f.view.render(game, 0, 0, false, "en", undefined, true, size);
      const worldPerPixel = (f.camera.right - f.camera.left) / 320;
      for (const { sprite } of f.internals.textLabels) {
        const factor = sprite.scale.x / 6.4;
        assert.ok(
          (SPRITE_FONT_HEIGHT * factor) / worldPerPixel >=
            10 * TEXT_SIZE_FACTORS[size] - 1e-8,
        );
        if (!sprite.visible) continue;
        const center = sprite
          .getWorldPosition(new THREE.Vector3())
          .project(f.camera);
        const halfWidth =
          ((sprite.textWidth / 100) * factor) / worldPerPixel / 320;
        const halfHeight =
          ((sprite.textHeight / 100) * factor) / worldPerPixel / 100;
        assert.ok(Math.abs(center.x) + halfWidth <= 1 + 1e-8);
        assert.ok(Math.abs(center.y) + halfHeight <= 1 + 1e-8);
      }
    }
  } finally {
    f.close();
  }
});

test("live mechanism slips and crane numbers resize without resetting progress or replacing resources", () => {
  const f = fixture(320, 408);
  try {
    const game = newGame(1, 1);
    Object.assign(game.players[0], bankPoint(CROSSINGS[1], CROSSINGS[1].near));
    for (let frame = 0; frame < 30; frame++)
      stepGame(game, { 0: { ...idleInput(), fold: true } });
    f.view.render(game, 0, 0, false, "en", undefined, true, "standard");
    const card = f.root.children.find((node) => node instanceof MechanismCard)!;
    assert.ok(card);
    const numbers: THREE.Sprite[] = [];
    f.root.traverse((node) => {
      if (node instanceof THREE.Sprite && node.name === "label")
        numbers.push(node);
    });
    const widths = numbers.map((node) => node.scale.x);
    const width = card.scale.x;
    const ids = resources(f.root);
    const before = structuredClone(game);
    f.view.render(game, 0, 0, false, "en", undefined, true, "largest");
    assert.ok(Math.abs(card.scale.x - width * 1.4) < 1e-10);
    numbers.forEach((node, index) =>
      assert.ok(Math.abs(node.scale.x - widths[index] * 1.4) < 1e-10),
    );
    const worldPerPixel = (f.camera.right - f.camera.left) / 320;
    const center = card.getWorldPosition(new THREE.Vector3()).project(f.camera);
    assert.ok(
      Math.abs(center.x) + card.scale.x / worldPerPixel / 320 <= 1 + 1e-8,
    );
    assert.ok(
      Math.abs(center.y) +
        (card.scale.x * MECHANISM_CARD_ASPECT) / worldPerPixel / 408 <=
        1 + 1e-8,
    );
    assert.deepEqual(game, before);
    assert.deepEqual(resources(f.root), ids);
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
