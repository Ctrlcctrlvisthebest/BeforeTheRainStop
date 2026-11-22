import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS } from "../src/game";
import { WEATHER } from "../src/weather";
import { WeatherRanges } from "../src/weather-ranges";
import { disposeObjectTree } from "../src/scene-resources";
import { rainFloorAt } from "../src/rain-occlusion";

test("rain range follows the union of actual zones and cuts fixed roofs from its volume", () => {
  const covers = [{ x: 0, z: 0, w: 4, d: 2, top: 5 }];
  const ranges = new WeatherRanges(
    LEVELS[0],
    {
      period: 10,
      awnings: [],
      zones: [
        { x: 0, z: 0, w: 10, d: 6, rate: 10 },
        { x: 2, z: 0, w: 8, d: 4, rate: 15 },
        { x: 20, z: 0, w: 4, d: 4, rate: 0 },
      ],
    },
    covers,
    1,
  );
  ranges.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const [x, z, expected] of [
    [0.17, 0.23, 5],
    [3.17, 0.23, 0],
    [5.17, 0.23, 0],
    [6.17, 0.23, null],
    [20.17, 0.23, null],
  ] as const) {
    ray.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(ranges.rain, false);
    assert.equal(
      hits.length,
      expected === null ? 0 : 1,
      `rain footprint at ${x},${z}`,
    );
    if (expected !== null)
      assert.ok(Math.abs(hits[0].point.y - expected) < 0.00001);
  }
  disposeObjectTree(ranges);
});

test("all hundred maps keep rain surfaces and wind volumes within their real bounds", () => {
  for (let index = 0; index < LEVELS.length; index++) {
    const level = LEVELS[index],
      weather = WEATHER[index];
    const ground = Math.min(...level.platforms.map((platform) => platform.y));
    const covers = weather.awnings.map((awning) => ({
      ...awning,
      top: awning.y,
    }));
    const ranges = new WeatherRanges(level, weather, covers, 6);
    ranges.updateMatrixWorld(true);
    const positions = ranges.rain.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, i);
      const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
      assert.ok([...a, ...b, ...c].every(Number.isFinite));
      for (const vertex of [a, b, c])
        assert.ok(
          vertex.y >= ground - 0.00001,
          `level ${index + 1}: rain range extends below ground ${ground}`,
        );
      const point = a
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      assert.ok(
        weather.zones.some(
          (zone) =>
            zone.rate > 0 &&
            Math.abs(point.x - zone.x) <= zone.w / 2 + 0.00001 &&
            Math.abs(point.z - zone.z) <= zone.d / 2 + 0.00001,
        ),
      );
      if (
        Math.abs(positions.getY(i) - positions.getY(i + 1)) < 0.00001 &&
        Math.abs(positions.getY(i) - positions.getY(i + 2)) < 0.00001
      )
        assert.ok(
          Math.abs(point.y - rainFloorAt(point, covers, ground)) < 0.00001,
          JSON.stringify({
            level: index + 1,
            point: point.toArray(),
            expected: rainFloorAt(point, covers, ground),
            triangle: [i, i + 1, i + 2].map((vertex) => [
              positions.getX(vertex),
              positions.getY(vertex),
              positions.getZ(vertex),
            ]),
          }),
        );
    }
    assert.equal(ranges.winds.children.length, level.winds.length);
    level.winds.forEach((wind, i) => {
      const bounds = new THREE.Box3().setFromObject(ranges.winds.children[i]);
      assert.ok(
        bounds.min.distanceTo(
          new THREE.Vector3(
            wind.x - wind.w / 2,
            wind.y - 0.2,
            wind.z - wind.d / 2,
          ),
        ) < 0.00001,
      );
      assert.ok(
        bounds.max.distanceTo(
          new THREE.Vector3(
            wind.x + wind.w / 2,
            wind.y + wind.height,
            wind.z + wind.d / 2,
          ),
        ) < 0.00001,
      );
    });
    disposeObjectTree(ranges);
  }
});

test("moving roof and paper cover updates reuse geometry and stop when ranges are hidden", () => {
  const ranges = new WeatherRanges(LEVELS[2], WEATHER[2], [], 2);
  const geometry = ranges.rain.geometry;
  const positions = geometry.getAttribute("position");
  const uniforms = ranges.rain.material.uniforms;
  const bounds = uniforms.coverBounds.value;
  assert.equal(ranges.visible, false);
  ranges.update(1.45, [{ x: 1, z: 2, w: 3, d: 4, top: 5 }]);
  assert.equal(uniforms.coverCount.value, 0);
  ranges.visible = true;
  ranges.update(1.45, [{ x: 1, z: 2, w: 3, d: 4, top: 5 }]);
  assert.equal(uniforms.coverCount.value, 1);
  assert.deepEqual(bounds[0].toArray(), [1, 2, 1.5, 2]);
  assert.equal(uniforms.coverTops.value[0], 5);
  ranges.update(0.75, [{ x: 8, z: 3, w: 3, d: 4, top: 7 }]);
  assert.deepEqual(bounds[0].toArray(), [8, 3, 1.5, 2]);
  assert.equal(uniforms.coverTops.value[0], 7);
  ranges.update(0.75, []);
  assert.equal(
    uniforms.coverCount.value,
    0,
    "released shelter no longer clips rain",
  );
  assert.equal(ranges.rain.geometry, geometry);
  assert.equal(geometry.getAttribute("position"), positions);
  assert.equal(uniforms.coverBounds.value, bounds);
  disposeObjectTree(ranges);
});
