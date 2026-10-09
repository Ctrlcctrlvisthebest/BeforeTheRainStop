import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

// Exercise the real editor App, including its history, model and extracted inspector.
const bundle = await build({
  stdin: {
    contents: `
      import "./src/editor";
      import { starterMap } from "./src/map-format";
      const fixture = starterMap();
      fixture.route.unshift({ kind: "walk", target: { x: 2, y: 0, z: 0 }, view: 0 });
      if (window.fixtureKind === "mixed") {
        fixture.weather.zones.push({ x: 3, z: 0, w: 4, d: 3, rate: 18 });
        fixture.level.winds.push({ x: 4, y: 0, z: 0, w: 2, d: 2, height: 5 });
        fixture.level.signs.push({ x: 2, y: 0, z: 0, text: "原来的路牌" });
      }
      localStorage.setItem("rain-map-editor-v1", JSON.stringify(fixture));
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
async function page(fixtureKind = "base") {
  const errors = [],
    console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/editor.html",
    pretendToBeVisual: true,
    runScripts: "outside-only",
    virtualConsole: console,
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.fixtureKind = fixtureKind;
  w.Blob = Blob;
  w.URL.createObjectURL = (blob) => {
    w.exportedBlob = blob;
    return "blob:editor-export";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    w.exportedName = this.download;
  };
  w.eval(bundle.outputFiles[0].text);
  const deadline = Date.now() + 2000;
  while (!w.document.querySelector(".inspector-panel")) {
    if (Date.now() > deadline) {
      w.close();
      assert.fail("Editor did not mount: " + errors.join("; "));
    }
    await settle();
  }
  const control = (label, scope = ".inspector-panel") => {
    const row = [
      ...w.document.querySelector(scope).querySelectorAll("label"),
    ].find((row) => row.textContent.trim().startsWith(label));
    assert.ok(row, "Missing field " + label);
    return row.querySelector("input,select,textarea");
  };
  const set = async (input, value) => {
    const prototype =
      input instanceof w.HTMLSelectElement
        ? w.HTMLSelectElement.prototype
        : input instanceof w.HTMLTextAreaElement
          ? w.HTMLTextAreaElement.prototype
          : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(
      input,
      String(value),
    );
    input.dispatchEvent(
      new w.Event(input instanceof w.HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
    await settle();
  };
  const choose = (kind, index = 0) =>
    set(control("选中对象"), `${kind}:${index}`);
  const button = (name) =>
    [...w.document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === name,
    );
  const exportMap = async () => {
    const exportButton = button("导出地图 ↓");
    assert.equal(
      exportButton.disabled,
      false,
      w.document.querySelector(".validation").textContent,
    );
    exportButton.click();
    await settle();
    assert.ok(w.exportedBlob);
    return JSON.parse(await w.exportedBlob.text());
  };
  return {
    w,
    errors,
    control,
    set,
    choose,
    button,
    exportMap,
    close: () => w.close(),
  };
}

test("platform inspector preserves ferry edits, undo/redo and exported JSON", async () => {
  const p = await page();
  try {
    await p.choose("platforms");
    await p.set(p.control("宽度 W"), 6);
    await p.set(p.control("平台种类"), "moving");
    await p.set(p.control("移动方向"), "z");
    await p.set(p.control("单侧移动距离"), 1.25);
    let map = await p.exportMap();
    assert.equal(map.level.platforms[0].w, 6);
    assert.deepEqual(map.level.platforms[0].motion, {
      axis: "z",
      range: 1.25,
      period: 6,
    });
    p.w.document.querySelector('[aria-label="撤销"]').click();
    await settle();
    map = await p.exportMap();
    assert.equal(map.level.platforms[0].motion.range, 2.2);
    p.w.document.querySelector('[aria-label="重做"]').click();
    await settle();
    map = await p.exportMap();
    assert.equal(map.level.platforms[0].motion.range, 1.25);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("entity inspectors expose their own dimensions and preserve sign text and rain-zone shape", async () => {
  const p = await page("mixed");
  try {
    await p.choose("zones");
    assert.equal(
      [...p.w.document.querySelectorAll(".object-inspector label")].some(
        (label) => label.textContent.includes("高度 Y"),
      ),
      false,
    );
    await p.set(p.control("X"), 6);
    await p.set(p.control("雨量 / 秒"), 24);
    await p.choose("winds");
    await p.set(p.control("风柱高度"), 7);
    await p.choose("signs");
    await p.set(p.control("路牌文字"), "沿桥前行");
    await p.set(p.control("显示视角"), 1);
    const map = await p.exportMap();
    assert.deepEqual(map.weather.zones[0], {
      x: 6,
      z: 0,
      w: 4,
      d: 3,
      rate: 24,
    });
    assert.equal(map.level.winds[0].height, 7);
    assert.equal(map.level.signs[0].text, "沿桥前行");
    assert.equal(map.level.signs[0].view, 1);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("route inspector never fabricates a ferry id when no moving platform exists", async () => {
  const p = await page();
  try {
    await p.choose("route");
    await p.set(p.control("引导动作"), "ferry");
    assert.equal(p.control("关联对象").value, "");
    assert.equal(p.button("导出地图 ↓").disabled, true);
    assert.match(
      p.w.document.querySelector(".validation").textContent,
      /id|引用对象|渡台/,
    );
    await p.set(p.control("引导动作"), "walk");
    await p.choose("platforms");
    await p.set(p.control("平台种类"), "moving");
    await p.choose("route");
    await p.set(p.control("引导动作"), "ferry");
    assert.equal(p.control("关联对象").value, "0");
    const map = await p.exportMap();
    assert.equal(map.route[0].id, 0);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
