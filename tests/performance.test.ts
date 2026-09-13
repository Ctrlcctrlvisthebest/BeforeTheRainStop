import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FrameBudget } from "../src/frame-budget";
import { colorSlab, mergeDecorations } from "../src/render-geometry";
import { rainFloorAt } from "../src/rain-occlusion";
import { LEVELS, platformAt, type Platform } from "../src/game";
import { WEATHER, BLAZE_ROOFS, SHIELD_RADIUS } from "../src/weather";
import { prepareBackdrop, SceneryOcclusion } from "../src/scenery-occlusion";
import {
  disposeObjectTree,
  platformLayer,
  landingHeight,
  surfacePriorities,
  stableNearbyLight,
  platformVisual,
} from "../src/scene-resources";
import { stabilizeTerrain, styleTerrainDepth } from "../src/terrain-scene";
import { TerrainEdges, topOutline } from "../src/terrain-edges";

function outlineLength(vertices: ArrayLike<number>) {
  let length = 0;
  for (let i = 0; i < vertices.length; i += 6)
    length += Math.hypot(
      vertices[i + 3] - vertices[i],
      vertices[i + 5] - vertices[i + 2],
    );
  return length;
}

// Independent reference: tile the plane at every rectangle boundary and sum
// edges separating filled and empty cells, counting the outside boundary once.
function unionPerimeter(platforms: readonly Platform[]) {
  let length = 0;
  for (const height of new Set(platforms.map((p) => p.y))) {
    const group = platforms.filter((p) => p.y === height);
    const xs = [
      ...new Set(group.flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2])),
    ].sort((a, b) => a - b);
    const zs = [
      ...new Set(group.flatMap((p) => [p.z - p.d / 2, p.z + p.d / 2])),
    ].sort((a, b) => a - b);
    const occupied = (x: number, z: number) =>
      x >= 0 &&
      z >= 0 &&
      x < xs.length - 1 &&
      z < zs.length - 1 &&
      group.some(
        (p) =>
          Math.abs((xs[x] + xs[x + 1]) / 2 - p.x) < p.w / 2 &&
          Math.abs((zs[z] + zs[z + 1]) / 2 - p.z) < p.d / 2,
      );
    for (let x = 0; x < xs.length - 1; x++)
      for (let z = 0; z < zs.length - 1; z++) {
        if (!occupied(x, z)) continue;
        if (!occupied(x - 1, z)) length += zs[z + 1] - zs[z];
        if (!occupied(x + 1, z)) length += zs[z + 1] - zs[z];
        if (!occupied(x, z - 1)) length += xs[x + 1] - xs[x];
        if (!occupied(x, z + 1)) length += xs[x + 1] - xs[x];
      }
  }
  return length;
}

test("platform outlines retain only the union boundary in every chapter and moving-platform position", () => {
  for (const level of LEVELS)
    for (const time of [0, 1.25, 2.5]) {
      const platforms = level.platforms.map((p) =>
        platformVisual(platformAt(p, time)),
      );
      const length = platforms.reduce(
        (sum, p, index) =>
          sum +
          outlineLength(
            topOutline(
              p,
              index,
              platforms.flatMap((platform, other) =>
                other === index ? [] : [{ platform, index: other }],
              ),
            ),
          ),
        0,
      );
      assert.ok(
        Math.abs(length - unionPerimeter(platforms)) < 0.0001,
        `${level.name}, time ${time}: no internal or duplicate edges; no missing outer edges`,
      );
    }
});

test("outline clipping handles containment, identical boxes, partial joins and real gaps", () => {
  const p = { x: 0, y: 0, z: 0, w: 4, h: 1, d: 4 };
  for (const platforms of [
    [p, { ...p }],
    [p, { ...p, w: 2, d: 2 }],
    [p, { ...p, x: 4, d: 2 }],
    [p, { ...p, x: 4.01 }],
    [p, { ...p, y: 0.5 }],
    [p, { ...p, x: -2, z: -2 }, { ...p, x: 2, z: 2 }],
  ]) {
    const actual = platforms.reduce(
      (sum, platform, index) =>
        sum +
        outlineLength(
          topOutline(
            platform,
            index,
            platforms.flatMap((p, other) =>
              other === index ? [] : [{ platform: p, index: other }],
            ),
          ),
        ),
      0,
    );
    assert.ok(Math.abs(actual - unionPerimeter(platforms)) < 0.0001);
  }
});

test("deck movement and appearance refresh joined edges while idle outlines reuse their buffers", () => {
  const bank = { x: 0, y: 0, z: 0, w: 2, h: 1, d: 2 };
  const deck = {
    ...bank,
    x: 4,
    motion: { axis: "x" as const, range: 4, period: 3 },
  };
  const sources = [bank, deck].map((platform) => {
    const node = new THREE.Group();
    node.position.set(platform.x, platform.y, platform.z);
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial(),
    );
    line.name = "landing-edge";
    node.add(line);
    return { node, platform, line };
  });
  const edges = new TerrainEdges(sources);
  const attribute = sources[0].line.geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  const version = attribute.version;
  for (let i = 0; i < 100; i++) edges.update();
  assert.equal(
    attribute.version,
    version,
    "stationary scene never reuploads outlines",
  );
  const length = () =>
    sources
      .filter(({ node }) => node.visible)
      .reduce((sum, { line }) => {
        const values = line.geometry
          .getAttribute("position")
          .array.slice(0, line.geometry.drawRange.count * 3);
        return sum + outlineLength(values);
      }, 0);
  assert.equal(length(), 16);
  sources[1].node.position.x = 2;
  edges.update();
  assert.equal(length(), 12, "docking removes the shared seam");
  sources[1].node.position.x = 1;
  edges.update();
  assert.equal(length(), 10, "overlapping surfaces retain one outer contour");
  sources[1].node.visible = false;
  edges.update();
  assert.equal(length(), 8, "removing a bridge restores the bank edge");
  sources[1].node.visible = true;
  sources[1].node.position.y = -0.5;
  edges.update();
  assert.equal(
    length(),
    16,
    "an arriving bridge below the bank does not erase its edge",
  );
  assert.equal(
    sources[0].line.geometry.getAttribute("position"),
    attribute,
    "moving decks reuse GPU storage",
  );
  sources.forEach(({ node }) => disposeObjectTree(node));
});

test("all coplanar platform overlaps have distinct depth priorities without moving collision geometry", () => {
  let overlaps = 0;
  for (const level of LEVELS) {
    const before = JSON.stringify(level.platforms);
    const platforms = level.platforms.map(platformVisual);
    const ranks = surfacePriorities(platforms);
    assert.ok(
      Math.max(...ranks) < 8,
      "small depth offsets in the shipped maps",
    );
    for (let i = 0; i < platforms.length; i++)
      for (let j = i + 1; j < platforms.length; j++) {
        const a = platforms[i],
          b = platforms[j];
        if (Math.abs(a.y - b.y) > 0.0001) continue;
        if (
          Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
          Math.abs(a.z - b.z) < (a.d + b.d) / 2
        ) {
          overlaps++;
          assert.notEqual(
            ranks[i],
            ranks[j],
            `${level.name}: overlapping platforms ${i}/${j}`,
          );
        }
      }
    assert.equal(JSON.stringify(level.platforms), before);
  }
  assert.ok(overlaps > 30, "exercise the real maps, including later chapters");
  const moving = {
    x: 0,
    y: 0,
    z: 0,
    w: 2,
    h: 1,
    d: 2,
    motion: { axis: "x" as const, range: 5, period: 2 },
  };
  const bank = { x: 5, y: 0, z: 0, w: 2, h: 1, d: 2 };
  assert.notEqual(...(surfacePriorities([moving, bank]) as [number, number]));
});

test("terrain layer hysteresis tolerates boundary jitter in both views and follows intermediate camera angles", () => {
  const floor = { x: 0, y: 0, z: 0, w: 2, h: 1, d: 2 };
  for (const view of [0, 1]) {
    let layer: "active" | "front" | "back" = "active";
    for (let frame = 0; frame < 200; frame++) {
      const offset = -1.45 + (frame % 2 ? 0.02 : -0.02);
      const p = { x: view ? offset : 0, y: 0, z: view ? 0 : offset };
      layer = platformLayer(floor, p, view, layer);
      assert.equal(layer, "active");
    }
    const outside = { x: view ? -1.8 : 0, y: 0, z: view ? 0 : -1.8 };
    assert.equal(platformLayer(floor, outside, view, layer), "front");
    const inside = { x: view ? -1.1 : 0, y: 0, z: view ? 0 : -1.1 };
    assert.equal(platformLayer(floor, inside, view, "front"), "active");
  }
  const sideTile = { ...floor, x: 5 };
  assert.equal(platformLayer(sideTile, { x: 0, y: 0, z: 0 }, 0), "active");
  assert.equal(platformLayer(sideTile, { x: 0, y: 0, z: 0 }, 0.5), "front");
});

test("terrain fades continuously and keeps stable draw order through repeated camera turns", () => {
  const root = new THREE.Group(),
    mat = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), mat);
  root.add(mesh);
  stabilizeTerrain(root, 2, 3);
  const priority = { order: mesh.renderOrder, offset: mat.polygonOffsetUnits };
  const tile = { x: 5, y: 0, z: 0, w: 2, h: 1, d: 2 },
    player = { x: 0, y: 0, z: 0 };
  styleTerrainDepth(root, tile, player, 0, false, 1 / 60);
  assert.equal(mat.opacity, 1);
  const opaqueVersion = mat.version;
  styleTerrainDepth(root, tile, player, 1, false, 1 / 60);
  assert.equal(
    mat.version,
    opaqueVersion + 1,
    "invalidate the cached OPAQUE shader",
  );
  assert.ok(
    mat.opacity > 0.7 && mat.opacity < 1,
    "no one-frame jump to 9% opacity",
  );
  for (let i = 0; i < 80; i++)
    styleTerrainDepth(root, tile, player, 1, false, 1 / 60);
  assert.equal(mat.opacity, 0.09);
  assert.equal(
    mat.version,
    opaqueVersion + 1,
    "fading must not recompile each frame",
  );
  for (let i = 0; i < 180; i++) {
    styleTerrainDepth(
      root,
      tile,
      player,
      (Math.sin(i / 20) + 1) / 2,
      false,
      1 / 60,
    );
    assert.deepEqual(
      { order: mesh.renderOrder, offset: mat.polygonOffsetUnits },
      priority,
    );
  }
  for (let i = 0; i < 80; i++)
    styleTerrainDepth(root, tile, player, 0, false, 1 / 60);
  assert.equal(mat.opacity, 1);
  assert.equal(mat.depthWrite, true);
  assert.equal(mat.transparent, false);
  disposeObjectTree(root);
});

test("roof cutaways stay faded during sightline jitter and restore gradually after leaving", () => {
  const root = new THREE.Group(),
    mat = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  const occlusion = new SceneryOcclusion();
  occlusion.add(root);
  const direction = new THREE.Vector3(0, 0, 1),
    subject = new THREE.Vector3(0.64, 0, -2);
  const opaqueVersion = mat.version;
  occlusion.update([subject], direction, 1 / 60);
  assert.equal(mat.opacity, 0.1);
  assert.equal(mat.version, opaqueVersion + 1);
  for (let i = 0; i < 120; i++) {
    subject.x = i % 2 ? 0.66 : 0.64;
    occlusion.update([subject], direction, 1 / 60);
    assert.equal(mat.opacity, 0.1);
  }
  assert.equal(mat.version, opaqueVersion + 1);
  subject.x = 1.1;
  occlusion.update([subject], direction, 1 / 60);
  assert.ok(mat.opacity > 0.1 && mat.opacity < 0.4);
  for (let i = 0; i < 80; i++) occlusion.update([subject], direction, 1 / 60);
  assert.equal(mat.opacity, 1);
  assert.equal(mat.version, opaqueVersion + 2);
  disposeObjectTree(root);
});

test("nearby fire lighting does not swap repeatedly at the midpoint", () => {
  const a = { position: new THREE.Vector3(-2, 0, 0) },
    b = { position: new THREE.Vector3(2, 0, 0) };
  let chosen = a;
  for (let i = 0; i < 120; i++) {
    chosen = stableNearbyLight(
      chosen,
      [a, b],
      new THREE.Vector3(i % 2 ? 0.02 : -0.02, 0, 0),
    )!;
    assert.equal(chosen, a);
  }
  assert.equal(
    stableNearbyLight(chosen, [a, b], new THREE.Vector3(1, 0, 0)),
    b,
  );
  assert.equal(stableNearbyLight(chosen, [b], new THREE.Vector3(0, 0, 0)), b);
  assert.equal(stableNearbyLight(chosen, [], new THREE.Vector3()), null);
});

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
