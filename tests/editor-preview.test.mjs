import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

// Mount the actual preview and use the real game, guide, input, clock,
// ContextRecovery and AdaptiveQuality. Stub GPU submission/compilation only.
const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { useState } from "react";
      import MapPreview from "./src/editor-preview";
      import { LEVELS } from "./src/game";
      import { WEATHER } from "./src/weather";
      import { GUIDE_ROUTES } from "./src/guide";
      window.baselineLevels = LEVELS.length;
      function App() {
        const [shown, setShown] = useState(true);
        const map = window.previewMap ??= {
          format: "before-the-rain-map", version: 1,
          level: structuredClone(LEVELS[0]),
          weather: structuredClone(WEATHER[0]), route: structuredClone(GUIDE_ROUTES[0]),
        };
        return shown ? <MapPreview map={map} onClose={window.closePreview ??= () => setShown(false)} /> : <p>已返回编辑</p>;
      }
      window.levels = LEVELS;
      createRoot(document.getElementById("root")).render(<App />);
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "preview-gpu-only",
      setup(b) {
        b.onResolve({ filter: /^\.\/scene$/ }, () => ({
          path: "scene",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          resolveDir: fileURLToPath(new URL("../", import.meta.url)),
          contents: `
          import { ContextRecovery } from "./src/context-recovery";
          import { AdaptiveQuality } from "./src/render-quality";
          export class PaperScene {
            constructor(canvas, options = {}) {
              this.canvas = canvas;
              this.quality = new AdaptiveQuality(options.quality);
              this.recovery = new ContextRecovery(canvas, status => {
                this.quality.resetObservation(); options.onContextStatus(status);
              }, 40);
              this.observations = [];
              window.scenes ??= []; window.scenes.push(this);
            }
            prepare(game) {
              this.game = game;
              window.preparations ??= [];
              return new Promise(resolve => window.preparations.push({ scene: this, resolve }));
            }
            observeFrame(now, active = true) {
              this.observations.push([now, active]);
              this.quality.observe(now, active && !this.recovery.lost);
            }
            render(game) { this.game = game; this.draws = (this.draws || 0) + 1; }
            dispose() { this.disposed = true; this.recovery.dispose(); }
          }
        `,
        }));
      },
    },
  ],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
async function page(savedQuality = "auto") {
  const errors = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (error) => errors.push(error.message));
  vc.on("error", (...args) => errors.push(args.map(String).join(" ")));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/",
    pretendToBeVisual: true,
    runScripts: "outside-only",
    virtualConsole: vc,
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  w.localStorage.setItem("rain-render-quality", JSON.stringify(savedQuality));
  let now = 0,
    next = 0;
  const frames = new Map();
  w.performance.now = () => now;
  w.requestAnimationFrame = (callback) => {
    frames.set(++next, callback);
    return next;
  };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  w.eval(bundle.outputFiles[0].text);
  const mountedBy = Date.now() + 3000;
  while (!w.preparations?.length) {
    if (Date.now() > mountedBy) {
      dom.window.close();
      assert.fail("Preview failed to mount: " + errors.join("; "));
    }
    await settle();
  }
  const tick = async (count = 1, interval = 1000 / 60) => {
    for (let i = 0; i < count; i++) {
      now += interval;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    }
    await settle();
  };
  const ready = async () => {
    w.preparations.splice(0).forEach(({ resolve }) => resolve(true));
    await settle();
  };
  const context = (type) =>
    w.document
      .querySelector("canvas")
      .dispatchEvent(new w.Event(type, { cancelable: true }));
  const scene = () => w.scenes.at(-1);
  const key = (type, key, code) =>
    w.document
      .querySelector("canvas")
      .dispatchEvent(new w.KeyboardEvent(type, { key, code, bubbles: true }));
  const button = (name) =>
    [...w.document.querySelectorAll(".preview-top button")].find(
      (button) => button.textContent === name,
    );
  return {
    w,
    tick,
    ready,
    context,
    scene,
    key,
    button,
    errors,
    close: () => w.close(),
  };
}

test("editor prepares before starting its clock, uses saved quality and releases registrations when closed", async () => {
  const p = await page("economy");
  try {
    assert.match(
      p.w.document.querySelector(".preview-result").textContent,
      /正在准备试玩/,
    );
    assert.equal(p.button("暂停").disabled, true);
    await p.tick(20, 1000);
    assert.equal(p.scene().game.time, 0);
    assert.equal(p.scene().quality.tier, "economy");
    await p.ready();
    assert.equal(p.w.document.querySelector(".preview-result"), null);
    await p.tick(6);
    assert.ok(
      p.scene().game.time > 0 && p.scene().game.time < 0.15,
      "loading time is discarded",
    );
    p.button("返回编辑 Esc").click();
    await settle();
    assert.equal(p.scene().disposed, true);
    assert.equal(p.w.levels.length, p.w.baselineLevels);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("editor context loss freezes simulation, clears a held direction and restores exactly the current run", async () => {
  const p = await page();
  try {
    await p.ready();
    p.key("keydown", "ArrowRight", "ArrowRight");
    await p.tick(6);
    assert.ok(p.scene().game.players[0].vx > 0);
    const game = p.scene().game,
      before = structuredClone(game);
    p.context("webglcontextlost");
    await settle();
    assert.match(
      p.w.document.querySelector(".preview-result").textContent,
      /正在恢复画面/,
    );
    const draws = p.scene().draws;
    await p.tick(10, 1000);
    assert.deepEqual(
      structuredClone(game),
      before,
      "invisible rain cannot advance during GPU loss",
    );
    assert.equal(p.scene().draws, draws);
    assert.equal(p.scene().observations.at(-1)[1], false);
    p.context("webglcontextrestored");
    await settle();
    assert.equal(
      p.button("暂停").disabled,
      true,
      "restored context is still preparing",
    );
    await p.tick(3, 1000);
    assert.deepEqual(structuredClone(game), before);
    await p.ready();
    await p.tick(2);
    assert.equal(p.scene().game.id, before.id);
    assert.ok(
      game.time - before.time < 0.04,
      "the interruption does not catch up",
    );
    assert.ok(
      game.players[0].vx < before.players[0].vx,
      "release starts ordinary physics deceleration",
    );
    await p.tick(15);
    assert.equal(
      game.players[0].vx,
      0,
      "old direction cannot reactivate without a new press",
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("context restoration preserves a prior user pause and paused/hidden frames never count toward automatic quality", async () => {
  const p = await page();
  try {
    await p.ready();
    await p.tick(4);
    p.button("暂停").click();
    await settle();
    const before = structuredClone(p.scene().game);
    p.context("webglcontextlost");
    await settle();
    p.context("webglcontextrestored");
    await settle();
    await p.ready();
    await p.tick(600, 40);
    assert.equal(p.button("继续").disabled, false);
    assert.deepEqual(structuredClone(p.scene().game), before);
    assert.equal(p.scene().quality.tier, "standard");
    assert.equal(p.scene().observations.at(-1)[1], false);
    p.button("继续").click();
    await settle();
    Object.defineProperty(p.w.document, "hidden", {
      configurable: true,
      value: true,
    });
    p.w.document.dispatchEvent(new p.w.Event("visibilitychange"));
    await p.tick(600, 40);
    assert.deepEqual(structuredClone(p.scene().game), before);
    assert.equal(p.scene().quality.tier, "standard");
    Object.defineProperty(p.w.document, "hidden", {
      configurable: true,
      value: false,
    });
    p.w.document.dispatchEvent(new p.w.Event("visibilitychange"));
    await p.tick(2);
    assert.ok(p.scene().game.time - before.time < 0.04);
    await p.tick(400, 40);
    assert.equal(
      p.scene().quality.tier,
      "economy",
      "sustained active slow frames do trigger automatic quality",
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("failed context recovery offers restart, and closing during pending compilation does not revive the preview", async () => {
  const p = await page();
  try {
    await p.ready();
    await p.tick(2);
    const original = p.scene();
    p.context("webglcontextlost");
    // Recovery's timer enqueues a React update. Under a parallel suite the
    // next DOM commit can follow the timer; wait for the visible result.
    const failedBy = Date.now() + 2000;
    while (
      !p.w.document
        .querySelector(".preview-result")
        ?.textContent.includes("画面暂未恢复")
    ) {
      if (Date.now() > failedBy)
        assert.fail("Recovery failure UI did not appear");
      await settle();
    }
    const result = p.w.document.querySelector(".preview-result");
    assert.match(result.textContent, /画面暂未恢复/);
    const restart = [...result.querySelectorAll("button")].find(
      (button) => button.textContent === "重新试玩",
    );
    assert.ok(restart);
    restart.click();
    await settle();
    assert.equal(original.disposed, true);
    assert.notEqual(p.scene().game, original.game);
    assert.equal(p.scene().game.time, 0);
    assert.equal(
      p.w.levels.length,
      p.w.baselineLevels + 1,
      "one temporary map registration only",
    );
    p.button("返回编辑 Esc").click();
    await settle();
    const pendingScene = p.scene();
    assert.equal(pendingScene.disposed, true);
    await p.ready();
    await p.tick(2);
    assert.match(p.w.document.body.textContent, /已返回编辑/);
    assert.equal(p.w.document.querySelector("canvas"), null);
    assert.equal(p.w.levels.length, p.w.baselineLevels);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
