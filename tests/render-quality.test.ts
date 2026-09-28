import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  AdaptiveQuality,
  qualityMode,
  qualitySettings,
} from "../src/render-quality";
import { ContextRecovery, type ContextStatus } from "../src/context-recovery";
import { RainCurtain } from "../src/weather-scene";
import { disposeObjectTree } from "../src/scene-resources";
import { RENDER_CASES, summarize } from "../benchmarks/render-stats";

function frames(
  quality: AdaptiveQuality,
  from: number,
  count: number,
  interval: number,
) {
  let changes = 0;
  for (let i = 0; i < count; i++)
    changes += Number(quality.observe(from + i * interval));
  return changes;
}

test("automatic quality needs sustained slow frames and cannot oscillate", () => {
  const quality = new AdaptiveQuality();
  assert.equal(frames(quality, 0, 240, 1000 / 60), 0);
  assert.equal(
    frames(quality, 4000, 20, 40),
    0,
    "a short busy encounter stays sharp",
  );
  assert.equal(frames(quality, 4800, 400, 40), 1);
  assert.equal(quality.tier, "economy");
  assert.equal(frames(quality, 20800, 5000, 1000 / 60), 0);
  assert.equal(
    quality.tier,
    "economy",
    "do not bounce between GPU settings mid-run",
  );
  assert.equal(quality.select("standard"), true);
  assert.equal(quality.tier, "standard");
  assert.equal(frames(quality, 0, 1000, 40), 0, "manual standard is respected");
});

test("single compilation stalls, hidden tabs and 30 Hz help do not trigger auto reduction", () => {
  const quality = new AdaptiveQuality();
  frames(quality, 0, 600, 1000 / 60);
  quality.observe(15000);
  assert.equal(frames(quality, 15020, 600, 1000 / 60), 0);
  for (let i = 0; i < 1000; i++) quality.observe(26000 + i * 33.3, false);
  assert.equal(quality.tier, "standard");
  assert.equal(frames(quality, 70000, 90, 40), 0, "fresh warm-up after pause");
  quality.observe(NaN);
  quality.observe(Infinity);
  quality.observe(-Infinity);
  assert.equal(quality.tier, "standard");
});

test("90/144 Hz display cadence never looks like sustained slow rendering", () => {
  for (const hz of [90, 144]) {
    const quality = new AdaptiveQuality();
    let next = 0;
    for (let i = 0; i < hz * 60; i++) {
      const now = (i * 1000) / hz;
      if (now >= next - 0.75) {
        assert.equal(quality.observe(now), false);
        next += 1000 / 60;
      }
    }
    assert.equal(quality.tier, "standard");
  }
});

test("quality settings preserve the standard look and bound resolution on unknown devices", () => {
  assert.equal(qualityMode("broken"), "auto");
  assert.equal(qualityMode(null), "auto");
  assert.equal(qualityMode("economy"), "economy");
  assert.deepEqual(qualitySettings("standard", 3, false), {
    pixelRatio: 2,
    shadowSize: 2048,
    rainDrops: 560,
  });
  assert.deepEqual(qualitySettings("standard", 3, true), {
    pixelRatio: 1.5,
    shadowSize: 1024,
    rainDrops: 560,
  });
  assert.deepEqual(qualitySettings("economy", 3, false), {
    pixelRatio: 1,
    shadowSize: 512,
    rainDrops: 320,
  });
  for (const bad of [NaN, Infinity, 0, -1])
    assert.equal(qualitySettings("standard", bad, false).pixelRatio, 1);
});

test("power saving rain retains covers and reuses existing buffers when switched repeatedly", () => {
  const rain = new RainCurtain(
    {
      period: 10,
      awnings: [],
      zones: [{ x: 0, z: 0, w: 30, d: 30, rate: 12 }],
    },
    [],
  );
  const meshes = rain.children as THREE.LineSegments[];
  const geometry = meshes.map((mesh) => mesh.geometry);
  const positions = geometry.map((g) => g.getAttribute("position"));
  try {
    for (let n = 0; n < 40; n++) {
      const count = n % 2 ? 560 : 320;
      rain.setBudget(count);
      rain.update(n / 60, { x: 0, y: 1, z: 0 }, 1, [
        { x: 0, z: 0, w: 50, d: 50, top: 2 },
      ]);
      assert.equal(geometry[0].drawRange.count, count * 2);
      assert.equal(geometry[1].drawRange.count, count * 4);
      for (let i = 0; i < count * 2; i++)
        assert.ok(
          positions[0].getY(i) >= 2,
          "a lower density cannot leak through shelter",
        );
      meshes.forEach((mesh, i) => {
        assert.equal(mesh.geometry, geometry[i]);
        assert.equal(mesh.geometry.getAttribute("position"), positions[i]);
      });
    }
    rain.setBudget(Infinity);
    assert.equal(geometry[0].drawRange.count, 1120);
    rain.setBudget(-100);
    assert.equal(geometry[0].drawRange.count, 160);
  } finally {
    disposeObjectTree(rain);
  }
});

test("context loss is reported once, restored after renderer handlers, and never times out after recovery", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const canvas = new EventTarget();
  const events: string[] = [];
  canvas.addEventListener("webglcontextrestored", () =>
    events.push("renderer-restored"),
  );
  const recovery = new ContextRecovery(canvas, (status) => events.push(status));
  const loss = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(loss);
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.equal(loss.defaultPrevented, true);
  assert.equal(recovery.lost, true);
  assert.deepEqual(events, ["lost"]);
  t.mock.timers.tick(29_000);
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  assert.equal(recovery.lost, false);
  t.mock.timers.tick(100_000);
  assert.deepEqual(events, ["lost", "renderer-restored", "restored"]);
  recovery.dispose();
});

test("context timeout is bounded, supports late browser restoration, and disposal removes pending callbacks", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const canvas = new EventTarget();
  const statuses: ContextStatus[] = [];
  const recovery = new ContextRecovery(canvas, (status) =>
    statuses.push(status),
  );
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  t.mock.timers.tick(120_000);
  assert.deepEqual(
    statuses,
    ["lost", "failed"],
    "one failure and no retry loop",
  );
  assert.equal(recovery.lost, true);
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  assert.deepEqual(statuses, ["lost", "failed", "restored"]);
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  recovery.dispose();
  t.mock.timers.tick(100_000);
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.deepEqual(statuses, ["lost", "failed", "restored", "lost"]);
});

test("benchmark reports tail spikes instead of hiding them in the mean and covers every advanced map", () => {
  const stats = summarize([...Array.from({ length: 98 }, () => 16), 80, 400]);
  assert.equal(stats.samples, 100);
  assert.equal(stats.p95, 16);
  assert.equal(stats.p99, 80);
  assert.equal(stats.max, 400);
  assert.equal(stats.over50ms, 2);
  assert.equal(summarize([NaN, Infinity]).samples, 0);
  for (let level = 27; level < 40; level++)
    for (const mode of [1, 6])
      assert.ok(RENDER_CASES.some(([m, l]) => m === mode && l === level));
  assert.equal(
    new Set(RENDER_CASES.map(([m, l]) => `${m}/${l}`)).size,
    RENDER_CASES.length,
  );
});
