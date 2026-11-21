import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RainCurtain, WindLeaves } from "../src/weather-scene";
import { LEVELS } from "../src/game";
import { WEATHER } from "../src/weather";
import { translate } from "../src/i18n";
import { RAIN_RATE_FACTORS, RAIN_DIFFICULTIES } from "../src/rain-difficulty";

function positions(group: THREE.Group) {
  return group.children.map(
    (o) =>
      (o as THREE.LineSegments).geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute,
  );
}
const weather = {
  period: 10,
  awnings: [],
  zones: [{ x: 0, z: 0, w: 72, d: 72, rate: 12 }],
};

test("rain falls downward above high platforms, is clipped by moving cover and reuses buffers", () => {
  const rain = new RainCurtain(weather, [
    { x: 0, z: 0, w: 100, d: 100, top: 18 },
  ]);
  const original = positions(rain);
  for (const time of [0, 1.3, 18, 250]) {
    rain.update(time, { x: 0, y: 16, z: 0 }, 1.45, [
      { x: 0, z: 0, w: 100, d: 100, top: 20 },
    ]);
    const drops = original[0];
    let visibleDrops = 0;
    for (let i = 0; i < drops.count; i += 2) {
      assert.ok(Number.isFinite(drops.getY(i)));
      assert.ok(
        drops.getY(i) >= drops.getY(i + 1),
        "the tail cannot fall upward above the old y=12 ceiling",
      );
      assert.ok(
        drops.getY(i + 1) >= 20,
        "a boat/roof/paper shield blocks rain at its surface",
      );
      visibleDrops += Number(drops.getY(i) > drops.getY(i + 1));
    }
    assert.ok(visibleDrops > 100, "large maps still have visible rainfall");
    positions(rain).forEach((p, i) => assert.equal(p, original[i]));
  }
  rain.update(2, { x: 90, y: 16, z: 90 }, 1, []);
  assert.equal(
    rain.visible,
    false,
    "do not put decorative rain outside real rain zones",
  );
  rain.update(3, { x: 0, y: 16, z: 0 }, 1, []);
  assert.equal(rain.visible, true);
});

test("wind leaves stay within real updraft bounds on all hundred maps", () => {
  for (const level of LEVELS) {
    const wind = new WindLeaves(level.winds);
    for (const time of [0, 1.4, 67]) {
      wind.update(time);
      for (const positions of positionsOf(wind)) {
        const perWind = positions.count / level.winds.length;
        for (let i = 0; i < positions.count; i++) {
          const w = level.winds[Math.floor(i / perWind)];
          assert.ok(Math.abs(positions.getX(i) - w.x) <= w.w / 2 + 0.001);
          assert.ok(Math.abs(positions.getZ(i) - w.z) <= w.d / 2 + 0.001);
          assert.ok(
            positions.getY(i) >= w.y && positions.getY(i) <= w.y + w.height,
          );
        }
      }
    }
  }
});

test("rain difficulty scales falling speed while leaving coverage and reduced motion unchanged", () => {
  const focus = { x: 0, y: 0, z: 0 };
  for (const difficulty of RAIN_DIFFICULTIES) {
    const factor = RAIN_RATE_FACTORS[difficulty];
    const rain = new RainCurtain(weather, []);
    const normal = new RainCurtain(weather, []);
    rain.update(0, focus, 0.75, [], false, factor);
    const y0 = positions(rain)[0].getY(0);
    rain.update(0.01, focus, 0.75, [], false, factor);
    normal.update(0, focus, 0.75, []);
    const normalY0 = positions(normal)[0].getY(0);
    normal.update(0.01, focus, 0.75, []);
    const expectedFall = (normalY0 - positions(normal)[0].getY(0)) * factor;
    assert.ok(
      Math.abs(y0 - positions(rain)[0].getY(0) - expectedFall) < 0.00001,
    );
    rain.update(2, focus, 1.45, [], true, factor);
    normal.update(20, focus, 1.45, [], true);
    assert.deepEqual(
      positions(rain).map((p) => Array.from(p.array)),
      positions(normal).map((p) => Array.from(p.array)),
    );
  }
});
const positionsOf = positions;

test("reduced motion freezes ambient rain and wind independently of game time", () => {
  for (const group of [
    new RainCurtain(weather, []),
    new WindLeaves(LEVELS[13].winds),
  ]) {
    const update = (t: number) =>
      group instanceof RainCurtain
        ? group.update(t, { x: 0, y: 0, z: 0 }, 0.75, [], true)
        : group.update(t, true);
    update(1);
    const before = positions(group).map((p) => Array.from(p.array));
    update(9);
    assert.deepEqual(
      positions(group).map((p) => Array.from(p.array)),
      before,
    );
  }
});

test("all hundred title translations remain distinct and every rain scene is finite", () => {
  assert.equal(LEVELS.length, 100);
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 100);
  assert.equal(new Set(LEVELS.map((l) => translate("en", l.name))).size, 100);
  LEVELS.forEach((l, i) => {
    assert.notEqual(translate("en", l.name), l.name, l.name);
    const rain = new RainCurtain(WEATHER[i], []);
    rain.update(4, l.exit, 1.45, []);
    for (const p of positions(rain))
      assert.ok(Array.from(p.array).every(Number.isFinite));
  });
});
