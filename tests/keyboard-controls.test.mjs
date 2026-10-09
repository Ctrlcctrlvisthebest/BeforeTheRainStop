import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";

// Use real DOM capture/bubble phases and the actual React selector, rather
// than treating a swallowed keyup as another direct call to KeyboardInput.up.
const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { flushSync } from "react-dom";
      import { useState } from "react";
      import { bindGameKeyboard, KeyboardInput } from "./src/keyboard-input";
      import { TouchInput, mergeInput } from "./src/touch-input";
      import { RainSelect } from "./src/rain-select";
      const keyboard = new KeyboardInput(), touch = new TouchInput();
      window.controls = {
        keyboard, touch, jumps: 0, escapes: 0, restarts: 0, changes: 0,
        read: () => mergeInput(keyboard.read(performance.now()), touch.read(performance.now())),
      };
      window.unbindControls = bindGameKeyboard(keyboard, {
        enabled: () => true,
        clear: () => touch.clear(),
        change: () => window.controls.changes++,
        jump: () => window.controls.jumps++,
        escape: () => window.controls.escapes++,
        restart: () => window.controls.restarts++,
      });
      function App() {
        const [value, setValue] = useState("auto");
        return <>
          <canvas tabIndex={0} />
          <button id="ordinary"><span>Help</span></button>
          <details><summary>Menu</summary></details>
          <a href="#help">Help link</a>
          <input aria-label="Name" />
          <RainSelect value={value} onChange={setValue} label="Quality"
            options={[{value: "auto", label: "Auto"}, {value: "standard", label: "Standard"}]} />
        </>;
      }
      const root = createRoot(document.getElementById("root"));
      flushSync(() => root.render(<App />));
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty" },
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
async function page() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.eval(bundle.outputFiles[0].text);
  await settle();
  const key = (target, type, code, extras = {}) => {
    const keys = {
      Space: " ",
      ShiftLeft: "Shift",
      KeyD: "d",
      KeyT: "t",
    };
    const event = new w.KeyboardEvent(type, {
      key: keys[code] ?? code,
      code,
      bubbles: true,
      cancelable: true,
      ...extras,
    });
    target.dispatchEvent(event);
    return event;
  };
  return {
    w,
    key,
    controls: w.controls,
    canvas: w.document.querySelector("canvas"),
    selector: w.document.querySelector('[role="combobox"]'),
    close: () => {
      w.unbindControls();
      w.close();
    },
  };
}

test("moving from a held direction into the selector retires input without reviving it on key repeat", async () => {
  const p = await page();
  const { canvas, selector, key, controls, w } = p;
  try {
    canvas.focus();
    key(canvas, "keydown", "KeyD");
    key(canvas, "keydown", "ShiftLeft", { shiftKey: true });
    assert.equal(controls.read().axis, 1);
    assert.equal(controls.read().fold, true);
    selector.focus();
    assert.equal(controls.read().axis, 0);
    assert.equal(controls.read().fold, false);
    key(selector, "keydown", "Space");
    await settle();
    assert.equal(selector.getAttribute("aria-expanded"), "true");
    selector.addEventListener("keyup", (event) => event.stopPropagation());
    key(selector, "keyup", "KeyD");
    key(selector, "keyup", "ShiftLeft", { shiftKey: false });
    key(selector, "keydown", "ArrowDown");
    await settle();
    key(selector, "keydown", "Escape");
    await settle();
    assert.equal(selector.getAttribute("aria-expanded"), "false");
    assert.equal(controls.escapes, 0, "Escape belongs to the selector");
    assert.equal(controls.jumps, 0);
    assert.equal(w.document.querySelector('[role="listbox"]'), null);
    canvas.focus();
    key(canvas, "keydown", "KeyD", { repeat: true });
    assert.equal(controls.read().axis, 0);
    key(canvas, "keyup", "KeyD");
    key(canvas, "keydown", "KeyD");
    assert.equal(controls.read().axis, 1, "a fresh game key still works");
  } finally {
    p.close();
  }
});

test("capture-phase release cannot be swallowed by a focused control or lose anonymous Shift cleanup", async () => {
  const p = await page();
  try {
    p.selector.focus();
    p.selector.addEventListener("keyup", (event) =>
      event.stopImmediatePropagation(),
    );
    // Simulate a release arriving at UI before its focus transition cleared
    // the prior game hold. This independently checks capture-phase cleanup.
    p.controls.keyboard.down("KeyD", performance.now());
    p.key(p.selector, "keyup", "KeyD");
    assert.equal(p.controls.read().axis, 0);
    p.controls.keyboard.down("ShiftLeft", performance.now());
    p.controls.keyboard.down("ShiftRight", performance.now());
    p.controls.keyboard.down("KeyB", performance.now());
    p.key(p.selector, "keyup", "", { key: "Shift", shiftKey: false });
    assert.equal(p.controls.read().fold, true, "B remains independent");
    p.key(p.selector, "keyup", "KeyB", { key: "b" });
    assert.equal(p.controls.read().fold, false);
  } finally {
    p.close();
  }
});

test("ordinary buttons, summaries, links, editable fields and ARIA controls own Space and navigation", async () => {
  const p = await page();
  try {
    const d = p.w.document;
    const controls = [
      d.querySelector("#ordinary span"),
      d.querySelector("summary"),
      d.querySelector("a"),
      d.querySelector("input"),
    ];
    for (const role of [
      "button",
      "combobox",
      "listbox",
      "menu",
      "menuitem",
      "slider",
      "checkbox",
      "radio",
      "textbox",
      "switch",
      "tab",
    ]) {
      const node = d.createElement("div");
      node.setAttribute("role", role);
      node.tabIndex = 0;
      d.body.append(node);
      controls.push(node);
    }
    const editable = d.createElement("div");
    editable.setAttribute("contenteditable", "");
    d.body.append(editable);
    controls.push(editable);
    for (const target of controls) {
      for (const code of ["Space", "ArrowDown", "KeyD", "KeyT"])
        assert.equal(
          p.key(target, "keydown", code).defaultPrevented,
          false,
          `${target.outerHTML}: ${code} preserves UI/browser activation`,
        );
      assert.equal(p.controls.read().axis, 0);
      assert.equal(p.controls.read().jump, false);
    }
    assert.equal(p.controls.jumps, 0);
    assert.equal(p.controls.restarts, 0);
    assert.equal(p.key(p.canvas, "keydown", "Space").defaultPrevented, true);
    assert.equal(p.controls.jumps, 1, "Space still jumps on the game canvas");
  } finally {
    p.close();
  }
});

test("game help Escape remains available on ordinary buttons while editor/selector Escape stays isolated", async () => {
  const p = await page();
  try {
    const d = p.w.document;
    p.key(d.querySelector("#ordinary"), "keydown", "Escape");
    assert.equal(p.controls.escapes, 1);
    p.key(d.querySelector("input"), "keydown", "Escape");
    assert.equal(p.controls.escapes, 1);
    p.key(p.selector, "keydown", "Escape");
    assert.equal(p.controls.escapes, 1);
    p.key(p.canvas, "keydown", "Escape");
    assert.equal(p.controls.escapes, 2);
    p.canvas.addEventListener("keydown", (event) => event.preventDefault());
    p.key(p.canvas, "keydown", "Space");
    assert.equal(p.controls.jumps, 0, "an already handled key stays handled");
  } finally {
    p.close();
  }
});

test("UI focus clears keyboard holds while another finger's movement and paper bridge remain held", async () => {
  const p = await page();
  try {
    p.controls.touch.press(1, "axis", 1, performance.now());
    p.controls.touch.press(2, "fold", true, performance.now());
    p.canvas.focus();
    p.key(p.canvas, "keydown", "ArrowLeft");
    assert.equal(p.controls.read().axis, 0, "opposite inputs combine normally");
    p.selector.focus();
    assert.equal(p.controls.keyboard.read(performance.now()).axis, 0);
    assert.equal(p.controls.read().axis, 1, "touch direction keeps its hold");
    assert.equal(p.controls.read().fold, true);
    p.key(p.selector, "keyup", "ArrowLeft");
    assert.equal(p.controls.read().axis, 1);
    p.controls.touch.release(1, performance.now() + 150);
    p.controls.touch.release(2, performance.now() + 150);
    assert.equal(p.controls.read().axis, 0);
    assert.equal(p.controls.read().fold, false);
  } finally {
    p.close();
  }
});

test("unbind removes capture release and focus listeners as well as game keydown", async () => {
  const p = await page();
  try {
    p.w.unbindControls();
    p.controls.keyboard.down("KeyD", performance.now());
    p.selector.focus();
    p.key(p.selector, "keyup", "KeyD");
    assert.equal(p.controls.read().axis, 1, "old listeners no longer run");
    p.key(p.canvas, "keydown", "Space");
    assert.equal(p.controls.jumps, 0);
  } finally {
    p.close();
  }
});
