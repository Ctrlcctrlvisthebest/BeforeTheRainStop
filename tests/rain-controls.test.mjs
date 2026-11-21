import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { RainDifficultyControls, useRainDifficultyPreference } from "./src/rain-controls";
      function App({ language, disabled }) {
        const [value, select] = useRainDifficultyPreference();
        return <main data-difficulty={value}>
          <RainDifficultyControls value={value} onChange={select} language={language}
            disabled={disabled} title="Choose before starting" />
        </main>;
      }
      let root;
      window.show = (language, disabled) => root.render(<App language={language} disabled={disabled} />);
      window.mount = (language, disabled) => {
        root?.unmount();
        root = createRoot(document.getElementById("root"));
        window.show(language, disabled);
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

async function page({ saved, blockedStorage = false, disabled = false } = {}) {
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
    w.localStorage.setItem("rain-difficulty", JSON.stringify(saved));
  if (blockedStorage)
    Object.defineProperty(w, "localStorage", {
      get() {
        throw new w.DOMException("Storage blocked", "SecurityError");
      },
    });
  w.eval(bundle.outputFiles[0].text);
  w.mount("zh", disabled);
  const deadline = Date.now() + 2000;
  while (!w.document.querySelector('[role="combobox"]')) {
    if (Date.now() > deadline) {
      w.close();
      assert.fail("Rain difficulty control did not mount");
    }
    await settle();
  }
  const trigger = () => w.document.querySelector('[role="combobox"]');
  const options = () => [...w.document.querySelectorAll('[role="option"]')];
  return {
    w,
    errors,
    trigger,
    options,
    value: () => w.document.querySelector("main").dataset.difficulty,
    choose: async (label) => {
      trigger().click();
      await settle();
      const option = options().find(
        (node) =>
          node.querySelector(".rain-select-value").textContent === label,
      );
      assert.ok(option, `Missing rain difficulty choice: ${label}`);
      option.click();
      await settle();
    },
    show: async (language = "zh", disabled = false) => {
      w.show(language, disabled);
      await settle();
    },
    remount: async () => {
      w.mount("zh", disabled);
      await settle();
    },
    close: () => w.close(),
  };
}

test("normal is the initial difficulty and invalid saved values are ignored", async () => {
  for (const saved of [
    undefined,
    "impossible",
    null,
    1,
    { difficulty: "hard" },
  ]) {
    const p = await page({ saved });
    try {
      assert.equal(p.value(), "normal");
      assert.equal(p.trigger().getAttribute("aria-label"), "雨速");
      assert.match(p.trigger().textContent, /普通/);
      assert.deepEqual(p.errors, []);
    } finally {
      p.close();
    }
  }
});

test("saved and newly selected difficulties survive a remount", async () => {
  const p = await page({ saved: "easy" });
  try {
    assert.equal(p.value(), "easy");
    await p.choose("困难");
    assert.equal(p.value(), "hard");
    assert.equal(p.w.localStorage.getItem("rain-difficulty"), '"hard"');
    await p.remount();
    assert.equal(p.value(), "hard");
    await p.choose("普通");
    await p.remount();
    assert.equal(p.value(), "normal");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("Chinese and English menus expose the same three difficulty choices", async () => {
  const p = await page();
  try {
    p.trigger().click();
    await settle();
    assert.deepEqual(
      p
        .options()
        .map((node) => node.querySelector(".rain-select-value").textContent),
      ["简单", "普通", "困难"],
    );
    p.trigger().click();
    await p.show("en");
    assert.equal(p.trigger().getAttribute("aria-label"), "Rain speed");
    p.trigger().click();
    await settle();
    assert.deepEqual(
      p
        .options()
        .map((node) => node.querySelector(".rain-select-value").textContent),
      ["Easy", "Normal", "Hard"],
    );
    p.options()[0].click();
    await settle();
    assert.equal(p.value(), "easy");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("keyboard selection changes difficulty without activating game controls", async () => {
  const p = await page();
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
    assert.equal(p.value(), "hard");
    assert.equal(bubbled, 0);
    assert.equal(p.trigger().getAttribute("aria-expanded"), "false");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("a disabled fieldset prevents opening or changing the difficulty", async () => {
  const p = await page({ disabled: true });
  try {
    const field = p.w.document.querySelector("fieldset");
    assert.equal(field.disabled, true);
    assert.equal(field.title, "Choose before starting");
    assert.equal(p.trigger().matches(":disabled"), true);
    p.trigger().click();
    await settle();
    assert.equal(p.trigger().getAttribute("aria-expanded"), "false");
    assert.equal(p.options().length, 0);
    assert.equal(p.value(), "normal");
    assert.equal(p.w.localStorage.getItem("rain-difficulty"), null);
    await p.show("zh", false);
    await p.choose("简单");
    assert.equal(p.value(), "easy");
    p.trigger().click();
    await settle();
    assert.equal(p.trigger().getAttribute("aria-expanded"), "true");
    await p.show("zh", true);
    assert.equal(p.trigger().getAttribute("aria-expanded"), "false");
    assert.equal(p.options().length, 0);
    p.trigger().click();
    await settle();
    assert.equal(p.value(), "easy");
    assert.equal(p.trigger().getAttribute("aria-expanded"), "false");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("unavailable storage does not prevent changing the current difficulty", async () => {
  const p = await page({ blockedStorage: true });
  try {
    assert.equal(p.value(), "normal");
    await p.choose("困难");
    assert.equal(p.value(), "hard");
    await p.choose("简单");
    assert.equal(p.value(), "easy");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
