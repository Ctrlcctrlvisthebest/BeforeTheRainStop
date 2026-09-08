import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FrameBudget } from "../src/frame-budget";
import { colorSlab, mergeDecorations } from "../src/render-geometry";
import { rainFloorAt } from "../src/rain-occlusion";
import { LEVELS, platformAt } from "../src/game";
import { WEATHER, BLAZE_ROOFS, SHIELD_RADIUS } from "../src/weather";
import { prepareBackdrop, SceneryOcclusion } from "../src/scenery-occlusion";
import {
  disposeObjectTree,
  platformLayer,
  landingHeight,
} from "../src/scene-resources";

test("background art cannot cover the playable map or cast shadows on it", () => {
  const backdrop = new THREE.Group();
  const nested = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [
    new THREE.MeshBasicMaterial({ transparent: true }),
    new THREE.MeshBasicMaterial(),
  ]);
  mesh.castShadow = mesh.receiveShadow = true;
  nested.add(mesh);
  backdrop.add(nested);
  prepareBackdrop(backdrop);
  assert.equal(mesh.renderOrder, -100);
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  for (const m of mesh.material) {
    assert.equal(m.transparent, false);
    assert.equal(m.depthWrite, false);
    assert.equal(m.depthTest, false);
  }
  disposeObjectTree(backdrop);
});

test("blocking scenery fades for either teammate in both views and during a turn", () => {
  const scenery = new SceneryOcclusion();
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 4), material);
  roof.position.y = 3.4;
  roof.castShadow = true;
  root.add(roof);
  scenery.add(root);
  const clearPlayer = new THREE.Vector3(20, 0.5, 20);
  for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
    const direction = new THREE.Vector3(
      Math.sin(yaw) * 32,
      7.5,
      Math.cos(yaw) * 32,
    );
    const blockedPlayer = roof.position
      .clone()
      .addScaledVector(direction, -0.3);
    // One player can be in the clear while the other is behind a roof.
    scenery.update([clearPlayer, blockedPlayer], direction);
    assert.equal(material.opacity, 0.1);
    assert.equal(material.transparent, true);
    assert.equal(material.depthWrite, false);
    assert.equal(roof.castShadow, false);
    // A decoration behind the crane must regain its normal appearance.
    scenery.update([roof.position.clone().add(direction)], direction);
    assert.equal(material.opacity, 1);
    assert.equal(material.transparent, false);
    assert.equal(material.depthWrite, true);
    assert.equal(roof.castShadow, true);
  }
  disposeObjectTree(root);
});

test("scenery fade restores existing transparency and clears between maps", () => {
  const scenery = new SceneryOcclusion();
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  scenery.add(root);
  scenery.update([new THREE.Vector3(0, 0, -2)], new THREE.Vector3(0, 0, 1));
  assert.equal(material.opacity, 0.06);
  scenery.update([], new THREE.Vector3(0, 0, 1));
  assert.equal(material.opacity, 0.6);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  scenery.clear();
  scenery.update([new THREE.Vector3(0, 0, -2)], new THREE.Vector3(0, 0, 1));
  assert.equal(material.opacity, 0.6);
  disposeObjectTree(root);
});

test("depth styling distinguishes front and back lanes in both camera views", () => {
  const tile = { x: 0, y: 0, z: 0, w: 10, h: 1, d: 2 };
  assert.equal(platformLayer(tile, { x: 0, y: 8, z: 0 }, 0), "active");
  assert.equal(platformLayer(tile, { x: 0, y: 0, z: -4 }, 0), "front");
  assert.equal(platformLayer(tile, { x: 0, y: 0, z: 4 }, 0), "back");
  // Turning uses the other span, including wide platforms that cross lanes.
  assert.equal(platformLayer(tile, { x: 4, y: 0, z: 20 }, 1), "active");
  assert.equal(platformLayer(tile, { x: -8, y: 0, z: 0 }, 1), "front");
  assert.equal(platformLayer(tile, { x: 8, y: 0, z: 0 }, 1), "back");
});
test("contact shadows select the highest floor below the player and disappear over gaps", () => {
  const floor = { x: 0, y: 0, z: 0, w: 4, h: 1, d: 2 };
  const upper = { ...floor, y: 3 };
  assert.equal(landingHeight({ x: 0, y: 1, z: 0 }, [floor, upper]), 0);
  assert.equal(landingHeight({ x: 0, y: 4, z: 0 }, [floor, upper]), 3);
  assert.equal(landingHeight({ x: 0, y: -1, z: 0 }, [floor, upper]), undefined);
  assert.equal(landingHeight({ x: 0, y: 4, z: 3 }, [floor, upper]), undefined);
  assert.equal(landingHeight({ x: 3, y: 4, z: 0 }, [floor, upper]), undefined);
});

for (const hz of [60, 90, 120, 144])
  test(`${hz} Hz screen keeps 60 render frames without slowing physics time`, () => {
    const budget = new FrameBudget();
    const frames: number[] = [];
    for (let i = 0; i < hz; i++)
      if (budget.ready((i * 1000) / hz)) frames.push((i * 1000) / hz);
    assert.ok(Math.abs(frames.length - 60) <= 1, `${frames.length} frames`);
    assert.ok(frames.at(-1)! > 970);
  });
test("paused frames use half the budget; hidden-tab time never creates a catch-up burst", () => {
  const budget = new FrameBudget();
  let frames = 0;
  for (let i = 0; i < 120; i++)
    if (budget.ready((i * 1000) / 120, 30)) frames++;
  assert.equal(frames, 30);
  assert.equal(budget.ready(10_000), true);
  assert.equal(budget.ready(10_001), false);
});
test("single-material platform geometry retains the exact top and side colors", () => {
  const geometry = new THREE.BoxGeometry(4, 1, 3);
  const count = geometry.getAttribute("position").count;
  colorSlab(geometry, "#53697b");
  const color = geometry.getAttribute("color"),
    normal = geometry.getAttribute("normal");
  assert.equal(geometry.getAttribute("position").count, count);
  assert.equal(geometry.groups.length, 0);
  for (let i = 0; i < count; i++) {
    const expected = new THREE.Color(
      normal.getY(i) > 0.5 ? "#8c98a3" : "#53697b",
    );
    assert.ok(Math.abs(color.getX(i) - expected.r) < 0.000001);
    assert.ok(Math.abs(color.getY(i) - expected.g) < 0.000001);
    assert.ok(Math.abs(color.getZ(i) - expected.b) < 0.000001);
  }
  geometry.dispose();
});
test("batched decorations preserve transforms, colors and independently animated tags", () => {
  const root = new THREE.Group(),
    tag = new THREE.Group();
  tag.name = "wish-tag";
  root.add(tag);
  for (const [x, color] of [
    [-2, "#f27461"],
    [2, "#53697b"],
  ] as const) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 0.2),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(x, 1, 0);
    mesh.rotation.z = 0.2;
    tag.add(mesh);
  }
  root.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(root);
  mergeDecorations(tag);
  assert.equal(tag.children.length, 1);
  assert.equal(root.getObjectByName("wish-tag"), tag);
  const after = new THREE.Box3().setFromObject(root);
  assert.ok(before.min.distanceTo(after.min) < 0.000001);
  assert.ok(before.max.distanceTo(after.max) < 0.000001);
  const merged = tag.children[0] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  assert.equal(merged.material.vertexColors, true);
  assert.equal(merged.geometry.getAttribute("position").count, 72);
  assert.equal(merged.geometry.groups.length, 0);
  tag.rotation.z = 0.1;
  assert.notDeepEqual(
    new THREE.Box3().setFromObject(root).min.toArray(),
    after.min.toArray(),
  );
  disposeObjectTree(root);
});
test("caching rain's fixed cover matches full occlusion checks in every chapter", () => {
  for (let level = 0; level < LEVELS.length; level++) {
    const map = LEVELS[level];
    const roofs = [...WEATHER[level].awnings, ...BLAZE_ROOFS[level]];
    for (let i = 0; i < 100; i++) {
      const seed = { x: ((i * 7.123) % 65) - 8, z: (-(i * 3.719) % 32) + 4 },
        time = i / 7;
      const shield = { x: i % 10, z: -(i % 7), y: 1.2 };
      let original = -2.5;
      for (const a of roofs)
        if (
          Math.abs(seed.x - a.x) < a.w / 2 &&
          Math.abs(seed.z - a.z) < a.d / 2
        )
          original = Math.max(original, a.y + 0.05);
      if (
        Math.abs(seed.x - shield.x) < SHIELD_RADIUS &&
        Math.abs(seed.z - shield.z) < SHIELD_RADIUS
      )
        original = Math.max(original, shield.y + 1.34);
      for (const raw of map.platforms) {
        const p = platformAt(raw, time);
        if (
          Math.abs(seed.x - p.x) < p.w / 2 &&
          Math.abs(seed.z - p.z) < p.d / 2
        )
          original = Math.max(original, p.y + 0.02);
      }
      const fixed = rainFloorAt(seed, [
        ...roofs.map((a) => ({ ...a, top: a.y + 0.05 })),
        ...map.platforms
          .filter((p) => !p.motion)
          .map((p) => ({ ...p, top: p.y + 0.02 })),
      ]);
      const moving = map.platforms
        .filter((p) => p.motion)
        .map((p) => {
          const at = platformAt(p, time);
          return { ...at, top: at.y + 0.02 };
        });
      moving.push({
        ...shield,
        w: SHIELD_RADIUS * 2,
        d: SHIELD_RADIUS * 2,
        h: 0,
        top: shield.y + 1.34,
      });
      assert.equal(
        rainFloorAt(seed, moving, fixed),
        original,
        `chapter ${level + 1}, seed ${i}`,
      );
    }
  }
});
