import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { TextSizeControls, useTextSizePreference } from "./src/text-size-controls";
      function App({ compact, language }) {
        const [value, select] = useTextSizePreference(compact);
        return <main className="app" data-text-size={value}>
          <TextSizeControls value={value} onChange={select} language={language} />
        </main>;
      }
      let root;
      window.show = (compact, language) => root.render(<App compact={compact} language={language} />);
      window.mount = (compact, language) => {
        root?.unmount();
        root = createRoot(document.getElementById("root"));
        window.show(compact, language);
      };
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"' },
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function page({ compact = true, saved, blockedStorage = false } = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  const w = dom.window;
  if (saved !== undefined)
    w.localStorage.setItem("rain-text-size", JSON.stringify(saved));
  if (blockedStorage)
    Object.defineProperty(w, "localStorage", {
      get() {
        throw new w.DOMException("Storage blocked", "SecurityError");
      },
    });
  w.eval(bundle.outputFiles[0].text);
  w.mount(compact, "zh");
  const deadline = Date.now() + 2000;
  while (!w.document.querySelector('[role="combobox"]')) {
    if (Date.now() > deadline) {
      w.close();
      assert.fail("Text size control did not mount");
    }
    await settle();
  }
  const trigger = () => w.document.querySelector('[role="combobox"]');
  return {
    w,
    errors,
    trigger,
    value: () => w.document.querySelector("main").dataset.textSize,
    choose: async (label) => {
      trigger().click();
      await settle();
      const option = [...w.document.querySelectorAll('[role="option"]')].find(
        (node) =>
          node.querySelector(".rain-select-value").textContent === label,
      );
      assert.ok(option, `Missing text size choice: ${label}`);
      option.click();
      await settle();
    },
    mount: async (compact) => {
      w.mount(compact, "zh");
      await settle();
    },
    close: () => w.close(),
  };
}

test("first use is larger on phones and standard on desktop", async () => {
  for (const [compact, expected] of [
    [true, "large"],
    [false, "standard"],
  ]) {
    const p = await page({ compact });
    try {
      assert.equal(p.value(), expected);
      assert.equal(p.trigger().getAttribute("aria-label"), "字号");
      assert.equal(p.w.localStorage.getItem("rain-text-size"), null);
      assert.deepEqual(p.errors, []);
    } finally {
      p.close();
    }
  }
});

test("explicit choices persist across reloads and phone or desktop layouts", async () => {
  const p = await page();
  try {
    await p.choose("特大");
    assert.equal(p.value(), "largest");
    assert.equal(p.w.localStorage.getItem("rain-text-size"), '"largest"');
    await p.mount(false);
    assert.equal(p.value(), "largest");
    await p.choose("标准");
    await p.mount(true);
    assert.equal(p.value(), "standard");
    assert.equal(p.trigger().getAttribute("aria-expanded"), "false");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("keyboard selection and language changes preserve the chosen setting", async () => {
  const p = await page({ compact: false });
  try {
    let bubbled = 0;
    p.w.addEventListener("keydown", () => bubbled++);
    p.trigger().focus();
    for (const key of ["Enter", "End", "Enter"]) {
      p.trigger().dispatchEvent(
        new p.w.KeyboardEvent("keydown", { key, bubbles: true }),
      );
      await settle();
    }
    assert.equal(p.value(), "largest");
    assert.equal(bubbled, 0, "selector keys do not activate game controls");
    p.w.show(false, "en");
    await settle();
    assert.equal(p.trigger().getAttribute("aria-label"), "Text size");
    assert.match(p.trigger().textContent, /Largest/);
    assert.equal(p.value(), "largest");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("unavailable storage does not prevent changing the current text size", async () => {
  const p = await page({ blockedStorage: true });
  try {
    assert.equal(p.value(), "large");
    await p.choose("特大");
    assert.equal(p.value(), "largest");
    await p.choose("标准");
    assert.equal(p.value(), "standard");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
