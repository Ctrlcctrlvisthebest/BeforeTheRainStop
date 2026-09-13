import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

// Exercise the real App, React DOM commits and game simulation. Only the GPU,
// audio output and network are stubbed; this is not a Chromebook GPU test.
const directory = fileURLToPath(new URL("../", import.meta.url));
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const bundle = await build({
  stdin: {
    contents: `
      import "./src/main.tsx";
      import { LEVELS } from "./src/game";
      import { createRoot } from "react-dom/client";
      import { useState } from "react";
      import { AppErrorBoundary } from "./src/app-error-boundary";
      window.testLevels = LEVELS;
      window.testInterfaceFailure = (container) => {
        function TranslatedText() {
          const [shown, setShown] = useState(true);
          return <div>{shown && "钥匙"}<button onClick={() => setShown(false)}>拾取</button></div>;
        }
        createRoot(container).render(<AppErrorBoundary><TranslatedText /></AppErrorBoundary>);
      };
    `,
    loader: "tsx",
    resolveDir: directory,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "test-renderer",
      setup(build) {
        build.onResolve({ filter: /^\.\/scene-loader$/ }, () => ({
          path: "scene",
          namespace: "test",
        }));
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: `
        export const warmScene = () => {};
        export const loadScene = async () => ({ PaperScene: class {
          render(game) { window.testGame = game; window.testFrames = (window.testFrames || 0) + 1; }
          dispose() { window.testDisposed = true; }
        }});
      `,
        }));
      },
    },
  ],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

async function page({
  language = "zh",
  compact = false,
  touchEvents = true,
} = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", (...args) =>
    errors.push(args.map(String).join(" ")),
  );
  virtualConsole.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const w = dom.window;
  if (!touchEvents) {
    delete w.ontouchstart;
    assert.equal("ontouchstart" in w, false);
  }
  w.addEventListener("error", (e) => errors.push(e.error?.stack || e.message));
  w.structuredClone = structuredClone;
  w.matchMedia = () => ({
    matches: compact,
    addEventListener() {},
    removeEventListener() {},
  });
  w.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  w.scrollTo = () => {};
  w.fetch = async () => ({ ok: false, status: 503 });
  w.HTMLMediaElement.prototype.play = async () => {};
  w.HTMLMediaElement.prototype.pause = () => {};
  w.localStorage.setItem("rain-language", JSON.stringify(language));
  let now = 0,
    next = 0;
  const frames = new Map();
  w.performance.now = () => now;
  w.requestAnimationFrame = (callback) => {
    frames.set(++next, callback);
    return next;
  };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  const tick = async (count = 10) => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
      await settle();
    }
  };
  w.eval(bundle.outputFiles[0].text);
  await settle();
  return { w, errors, tick, close: () => dom.window.close() };
}

// Translation engines replace text nodes with <font> elements. Respect the
// site's opt-out, and report whether any live application text was eligible.
function translateEligibleText(w) {
  const walker = w.document.createTreeWalker(
    w.document.getElementById("root"),
    w.NodeFilter.SHOW_TEXT,
  );
  const nodes = [];
  while (walker.nextNode()) {
    const text = walker.currentNode;
    if (
      text.textContent.trim() &&
      !text.parentElement.closest('[translate="no"],.notranslate')
    )
      nodes.push(text);
  }
  for (const text of nodes) {
    const replacement = w.document.createElement("font");
    replacement.textContent = `Translated: ${text.textContent}`;
    text.replaceWith(replacement);
  }
  return nodes.length;
}

for (const language of ["zh", "en"])
  for (const compact of [false, true])
    test(`${language}, compact=${compact}: protected HUD survives pickup, banking, language switch and restart`, async () => {
      const p = await page({ language, compact }),
        { w, tick } = p;
      try {
        assert.equal(
          w.document.querySelector('meta[name="google"]').content,
          "notranslate",
        );
        assert.equal(translateEligibleText(w), 0);
        w.document.querySelector(".menu button.primary").click();
        await settle();
        await tick();
        assert.ok(w.testGame);
        const runId = w.testGame.id;
        const key = w.testLevels[0].keys[0];
        Object.assign(w.testGame.players[0], { ...key, y: key.y - 0.7 });
        await tick();
        assert.deepEqual([...w.testGame.keys], [0]);
        assert.deepEqual(
          [...w.testGame.savedKeys],
          [0],
          "key at the next rack banks in the same tick",
        );
        assert.match(
          w.document.querySelector(".stats").textContent,
          /⚿\s*1\/1/,
        );
        assert.equal(translateEligibleText(w), 0);
        const frames = w.testFrames;
        w.document.querySelector("button.language").click();
        await tick();
        assert.equal(
          w.testGame.id,
          runId,
          "built-in language switch keeps the run",
        );
        assert.equal(
          w.document.documentElement.lang,
          language === "zh" ? "en" : "zh-CN",
        );
        assert.equal(
          w.document.querySelector("main").getAttribute("translate"),
          "no",
        );
        assert.ok(w.document.querySelector("canvas"));
        assert.ok(w.testFrames > frames);
        assert.equal(w.testDisposed, undefined);
        w.dispatchEvent(
          new w.KeyboardEvent("keydown", { key: "t", code: "KeyT" }),
        );
        w.dispatchEvent(
          new w.KeyboardEvent("keyup", { key: "t", code: "KeyT" }),
        );
        await tick();
        assert.notEqual(w.testGame.id, runId);
        assert.equal(w.testGame.keys.length, 0);
        assert.match(
          w.document.querySelector(".stats").textContent,
          /⚿\s*0\/1/,
        );
        assert.deepEqual(p.errors, []);
      } finally {
        p.close();
      }
    });

test("a translator replacing a React text node produces a recovery UI instead of an empty root", async () => {
  const p = await page();
  try {
    const container = p.w.document.createElement("div");
    p.w.document.body.append(container);
    p.w.testInterfaceFailure(container);
    await settle();
    const text = container.querySelector("div").firstChild;
    assert.equal(text.nodeType, p.w.Node.TEXT_NODE);
    const translation = p.w.document.createElement("font");
    translation.textContent = "Key";
    text.replaceWith(translation);
    container.querySelector("button").click();
    await settle();
    assert.match(
      container.querySelector('[role="alert"]').textContent,
      /游戏界面遇到问题/,
    );
    assert.match(container.querySelector("button").textContent, /Reload/);
    assert.ok(p.errors.some((e) => /NotFoundError|not a child/.test(e)));
  } finally {
    p.close();
  }
});

async function touchPage(options = {}) {
  const p = await page({ compact: true, ...options });
  const { w } = p;
  w.HTMLElement.prototype.setPointerCapture = () => {};
  w.document.querySelector(".menu button.primary").click();
  await settle();
  await p.tick();
  const left = w.document.querySelector('[aria-label="向左移动"]');
  const right = w.document.querySelector('[aria-label="向右移动"]');
  const jump = w.document.querySelector(".touch-jump");
  for (const [button, x] of [
    [left, 0],
    [right, 70],
    [jump, 200],
  ])
    button.getBoundingClientRect = () => ({
      left: x,
      right: x + 60,
      top: 0,
      bottom: 60,
      width: 60,
      height: 60,
    });
  const pointer = (type, target, extra = {}) => {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
      pointerId: 101,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 30,
      ...extra,
    });
    target.dispatchEvent(event);
  };
  const touch = (type, target, touches, changedTouches) => {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { touches, changedTouches });
    target.dispatchEvent(event);
    return event;
  };
  // Native Touch.identifier and PointerEvent.pointerId deliberately differ.
  const finger = (target, identifier = 7, clientX = 100) => ({
    identifier,
    target,
    clientX,
    clientY: 30,
  });
  return { ...p, left, right, jump, pointer, touch, finger };
}

test("mobile: lifting outside the button stops movement even without pointerup", async () => {
  const p = await touchPage();
  const { w, right, left, pointer, touch, finger, tick } = p;
  try {
    const r = finger(right);
    pointer("pointerdown", right);
    touch("touchstart", right, [r], [r]);
    await tick();
    assert.ok(w.testGame.players[0].vx > 0);
    touch("touchend", w.document.body, [], [r]);
    await tick();
    assert.equal(w.testGame.players[0].vx, 0, "lifting must release right");
    const l = finger(left, 8, 30);
    pointer("pointerdown", left, { pointerId: 202, clientX: 30 });
    touch("touchstart", left, [l], [l]);
    await tick();
    assert.ok(
      w.testGame.players[0].vx < 0,
      "left remains usable after release",
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("mobile: sliding one finger from right to left reverses and leaving the arrows stops", async () => {
  const p = await touchPage();
  const { w, right, pointer, touch, finger, tick } = p;
  try {
    const r = finger(right);
    pointer("pointerdown", right);
    touch("touchstart", right, [r], [r]);
    await tick();
    assert.ok(w.testGame.players[0].vx > 0);
    const l = { ...r, clientX: 30 };
    pointer("pointermove", right, { clientX: 30 });
    touch("touchmove", right, [l], [l]);
    await tick(16);
    assert.ok(
      w.testGame.players[0].vx < 0,
      "captured finger can reverse direction",
    );
    const outside = { ...r, clientX: 160 };
    pointer("pointermove", right, { clientX: 160 });
    touch("touchmove", right, [outside], [outside]);
    await tick();
    assert.equal(w.testGame.players[0].vx, 0);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("mobile: the next live TouchList removes a lost right finger while another finger jumps", async () => {
  const p = await touchPage();
  const { w, right, left, jump, pointer, touch, finger, tick } = p;
  try {
    const r = finger(right),
      j = finger(jump, 8, 230);
    pointer("pointerdown", right);
    touch("touchstart", right, [r], [r]);
    pointer("pointerdown", jump, { pointerId: 202, clientX: 230 });
    touch("touchstart", jump, [r, j], [j]);
    await tick();
    assert.ok(w.testGame.players[0].vx > 0);
    // The browser dropped both right-finger end events. Its live list on the
    // next contact must reconcile the missing finger without releasing jump.
    const l = finger(left, 9, 30);
    pointer("pointerdown", left, { pointerId: 303, clientX: 30 });
    touch("touchstart", left, [j, l], [l]);
    await tick(16);
    assert.ok(w.testGame.players[0].vx < 0);
    assert.equal(jump.getAttribute("aria-pressed"), "true");
    touch("touchcancel", w.document.body, [], [j, l]);
    await tick();
    assert.equal(w.testGame.players[0].vx, 0);
    assert.equal(jump.getAttribute("aria-pressed"), "false");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("pointer fallback: window release clears movement after capture failure", async () => {
  const p = await touchPage();
  const { w, right, pointer, tick } = p;
  try {
    right.setPointerCapture = () => {
      throw new Error("capture unavailable");
    };
    pointer("pointerdown", right, { pointerType: "mouse" });
    await tick();
    assert.ok(w.testGame.players[0].vx > 0);
    pointer("pointerup", w.document.body, { pointerType: "mouse", buttons: 0 });
    await tick();
    assert.equal(w.testGame.players[0].vx, 0);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("mobile: reused touch IDs and interrupted gestures cannot leave a direction held", async () => {
  const p = await touchPage();
  const { w, right, left, pointer, touch, finger, tick } = p;
  try {
    for (const interruption of [
      "blur",
      "pagehide",
      "orientationchange",
      "resize",
    ]) {
      const r = finger(right);
      pointer("pointerdown", right);
      touch("touchstart", right, [r], [r]);
      await tick();
      assert.ok(w.testGame.players[0].vx > 0);
      const l = finger(left, r.identifier, 30);
      // The old end was lost and the browser reuses the identifier.
      touch("touchstart", left, [l], [l]);
      await tick(16);
      assert.ok(w.testGame.players[0].vx < 0);
      w.dispatchEvent(new w.Event(interruption));
      await tick();
      assert.equal(w.testGame.players[0].vx, 0, interruption);
      // A delayed old move must not revive an interrupted gesture.
      touch("touchmove", left, [l], [l]);
      await tick();
      assert.equal(w.testGame.players[0].vx, 0);
    }
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("mobile: native touch takes over a fallback pointer without duplicating the held direction", async () => {
  const p = await touchPage({ touchEvents: false });
  const { w, right, left, pointer, touch, finger, tick } = p;
  try {
    const r = finger(right);
    pointer("pointerdown", right);
    touch("touchstart", right, [r], [r]);
    await tick();
    touch("touchend", w.document.body, [], [r]);
    const l = finger(left, 8, 30);
    touch("touchstart", left, [l], [l]);
    await tick(16);
    assert.ok(w.testGame.players[0].vx < 0);
    touch("touchend", w.document.body, [], [l]);
    await tick();
    assert.equal(w.testGame.players[0].vx, 0);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("mobile: fast action taps survive a frame and releasing a bridge finger preserves movement", async () => {
  const p = await touchPage();
  const { w, right, touch, finger, tick } = p;
  try {
    const turn = w.document.querySelector(".touch-turn");
    const fold = w.document.querySelector(".touch-fold");
    for (const button of [turn, fold])
      button.getBoundingClientRect = () => ({
        left: 300,
        right: 360,
        top: 0,
        bottom: 60,
      });
    const t = finger(turn, 8, 330);
    touch("touchstart", turn, [t], [t]);
    touch("touchend", turn, [], [t]);
    await tick();
    assert.equal(w.testGame.flips, 1);
    const r = finger(right),
      f = finger(fold, 9, 330);
    touch("touchstart", right, [r], [r]);
    touch("touchstart", fold, [r, f], [f]);
    await tick(20);
    assert.equal(fold.getAttribute("aria-pressed"), "true");
    touch("touchend", w.document.body, [r], [f]);
    await tick();
    assert.equal(fold.getAttribute("aria-pressed"), "false");
    assert.equal(right.getAttribute("aria-pressed"), "true");
    touch("touchend", w.document.body, [], [r]);
    await tick();
    assert.equal(right.getAttribute("aria-pressed"), "false");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("mobile: holding a direction does not swallow a second finger's menu tap", async () => {
  const p = await touchPage();
  const { w, right, touch, finger } = p;
  try {
    const r = finger(right);
    assert.equal(touch("touchstart", right, [r], [r]).defaultPrevented, true);
    const restart = w.document.querySelector(".touch-restart");
    const other = finger(restart, 8, 30);
    assert.equal(
      touch("touchstart", restart, [r, other], [other]).defaultPrevented,
      false,
    );
    assert.equal(
      touch("touchend", restart, [r], [other]).defaultPrevented,
      false,
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
