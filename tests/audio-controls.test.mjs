import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { useState } from "react";
      import { useGameAudio, MusicControls } from "./src/audio";
      function App() {
        const [language, setLanguage] = useState("zh");
        const audio = useGameAudio(false);
        return <><MusicControls audio={audio} language={language} />
          <button id="language" onClick={() => setLanguage(language === "zh" ? "en" : "zh")}>Language</button>
        </>;
      }
      createRoot(document.getElementById("root")).render(<App />);
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: {
    "import.meta.env.BASE_URL": '"./"',
    "process.env.NODE_ENV": '"production"',
  },
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

// Real React controls and hook, with deterministic media events and promises.
// The browser smoke test separately checks that the AAC files actually decode.
async function page(saved = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/toy/beforetherainstop/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  const w = dom.window;
  for (const [key, value] of Object.entries(saved))
    w.localStorage.setItem(key, JSON.stringify(value));
  const state = {
    paused: true,
    calls: [],
    defer: false,
    requests: [],
    fail: null,
  };
  Object.defineProperty(w.HTMLMediaElement.prototype, "paused", {
    get() {
      return state.paused;
    },
  });
  w.HTMLMediaElement.prototype.pause = function () {
    state.calls.push(["pause", this.getAttribute("src")]);
    state.paused = true;
    this.dispatchEvent(new w.Event("pause"));
  };
  w.HTMLMediaElement.prototype.load = function () {
    state.calls.push(["load", this.getAttribute("src")]);
    state.paused = true;
    this.currentTime = 0;
    this.dispatchEvent(new w.Event("emptied"));
  };
  w.HTMLMediaElement.prototype.play = function () {
    state.calls.push(["play", this.getAttribute("src")]);
    if (state.fail) return Promise.reject(state.fail);
    state.paused = false;
    if (state.defer)
      return new Promise((resolve, reject) =>
        state.requests.push({ resolve, reject }),
      );
    this.dispatchEvent(new w.Event("playing"));
    return Promise.resolve();
  };
  w.eval(bundle.outputFiles[0].text);
  await settle();
  w.document.querySelector(".music-options").click();
  await settle();
  const media = w.document.querySelector("audio");
  const toggle = () =>
    w.document.querySelector(".music-control > button").click();
  const select = async (id) => {
    const selector = w.document.querySelector("select");
    selector.value = id;
    selector.dispatchEvent(new w.Event("change", { bubbles: true }));
    await settle();
  };
  const playing = () =>
    w.document
      .querySelector(".music-control > button")
      .getAttribute("aria-pressed") === "true";
  return {
    w,
    media,
    state,
    toggle,
    select,
    playing,
    errors,
    close: () => w.close(),
  };
}

test("music defaults to the lively score, retains the original, and does not preload both", async () => {
  const p = await page();
  try {
    assert.equal(p.media.getAttribute("src"), "./audio/lantern-walk.m4a");
    assert.equal(p.media.preload, "none");
    assert.equal(p.media.loop, true);
    assert.equal(p.w.document.querySelectorAll("audio").length, 1);
    assert.deepEqual(
      [...p.w.document.querySelectorAll("option")].map(
        (option) => option.textContent,
      ),
      ["轻快 · 沿灯而行", "原版 · 檐下的愿望"],
    );
    assert.deepEqual(p.state.calls, []);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("saved original, volume and muted preferences survive reopening", async () => {
  const p = await page({
    "rain-music-track": "rain-wishes",
    "rain-music-volume": 37,
    "rain-music-enabled": false,
  });
  try {
    assert.equal(p.media.getAttribute("src"), "./audio/rain-wishes.m4a");
    assert.equal(p.w.document.querySelector("select").value, "rain-wishes");
    assert.equal(p.w.document.querySelector('input[type="range"]').value, "37");
    await p.select("lantern-walk");
    assert.equal(p.state.paused, true);
    assert.ok(!p.state.calls.some(([kind]) => kind === "play"));
    assert.equal(p.w.localStorage.getItem("rain-music-enabled"), "false");
    assert.equal(
      p.w.localStorage.getItem("rain-music-track"),
      '"lantern-walk"',
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("unknown stored track IDs safely fall back to the new local score", async () => {
  const p = await page({
    "rain-music-track": "https://invalid.test/untrusted.mp3",
  });
  try {
    assert.equal(p.media.getAttribute("src"), "./audio/lantern-walk.m4a");
  } finally {
    p.close();
  }
});

test("switching during playback uses one player, starts inside the gesture and resets progress", async () => {
  const p = await page();
  try {
    p.toggle();
    await settle();
    assert.equal(p.playing(), true);
    p.media.currentTime = 23;
    p.media.dispatchEvent(new p.w.Event("timeupdate"));
    await settle();
    assert.match(p.w.document.querySelector("output").textContent, /0:23/);
    const before = p.state.calls.length;
    const selector = p.w.document.querySelector("select");
    selector.value = "rain-wishes";
    selector.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    // No React effect or awaited network call before play(): mobile gesture survives.
    assert.deepEqual(p.state.calls.slice(before), [
      ["pause", "./audio/lantern-walk.m4a"],
      ["load", "./audio/rain-wishes.m4a"],
      ["play", "./audio/rain-wishes.m4a"],
    ]);
    await settle();
    assert.equal(p.w.document.querySelector("audio"), p.media);
    assert.equal(p.playing(), true);
    assert.match(p.w.document.querySelector("output").textContent, /0:00/);
    assert.equal(p.w.localStorage.getItem("rain-music-track"), '"rain-wishes"');
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("a manually paused track stays paused through a selection until play is pressed", async () => {
  const p = await page();
  try {
    p.toggle();
    await settle();
    p.toggle();
    await settle();
    const playCount = p.state.calls.filter(([kind]) => kind === "play").length;
    await p.select("rain-wishes");
    assert.equal(p.playing(), false);
    assert.equal(
      p.state.calls.filter(([kind]) => kind === "play").length,
      playCount,
    );
    p.toggle();
    await settle();
    assert.equal(p.playing(), true);
    assert.deepEqual(p.state.calls.at(-1), ["play", "./audio/rain-wishes.m4a"]);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("changing language does not reset the selected audio source or playback position", async () => {
  const p = await page();
  try {
    await p.select("rain-wishes");
    p.media.currentTime = 17;
    const calls = p.state.calls.length;
    p.w.document.getElementById("language").click();
    await settle();
    assert.equal(p.media.getAttribute("src"), "./audio/rain-wishes.m4a");
    assert.equal(p.media.currentTime, 17);
    assert.equal(p.state.calls.length, calls);
    assert.equal(
      p.w.document.querySelector("select").getAttribute("aria-label"),
      "Background music track",
    );
    assert.match(
      p.w.document.querySelector(".music-heading").textContent,
      /Wishes Beneath the Eaves/,
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("a stale play rejection from rapid switching cannot mark the new track as failed", async () => {
  const p = await page();
  try {
    p.state.defer = true;
    p.toggle();
    await settle();
    await p.select("rain-wishes");
    await p.select("lantern-walk");
    assert.equal(p.state.requests.length, 3);
    p.state.requests[2].resolve();
    await settle();
    p.state.requests[0].reject(
      new p.w.DOMException("interrupted", "AbortError"),
    );
    p.state.requests[1].reject(
      new p.w.DOMException("interrupted", "AbortError"),
    );
    await settle();
    assert.equal(p.playing(), true);
    assert.equal(p.media.getAttribute("src"), "./audio/lantern-walk.m4a");
    assert.doesNotMatch(p.w.document.body.textContent, /重试音乐|加载失败/);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("returning from the background resumes the currently selected original track", async () => {
  const p = await page();
  try {
    await p.select("rain-wishes");
    Object.defineProperty(p.w.document, "hidden", {
      configurable: true,
      value: true,
    });
    p.w.document.dispatchEvent(new p.w.Event("visibilitychange"));
    await settle();
    assert.equal(p.state.paused, true);
    Object.defineProperty(p.w.document, "hidden", {
      configurable: true,
      value: false,
    });
    p.w.document.dispatchEvent(new p.w.Event("visibilitychange"));
    await settle();
    assert.equal(p.playing(), true);
    assert.deepEqual(p.state.calls.at(-1), ["play", "./audio/rain-wishes.m4a"]);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("an autoplay rejection leaves a working play button and remembers the selected track", async () => {
  const p = await page();
  try {
    p.state.fail = new p.w.DOMException("gesture needed", "NotAllowedError");
    await p.select("rain-wishes");
    assert.equal(p.playing(), false);
    assert.equal(p.w.localStorage.getItem("rain-music-track"), '"rain-wishes"');
    p.state.fail = null;
    p.toggle();
    await settle();
    assert.equal(p.playing(), true);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
