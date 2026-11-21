import test from "node:test";
import assert from "node:assert/strict";
import {
  SPRITE_FONT_HEIGHT,
  setSpriteTextScale,
  textSprite,
  writeSpriteText,
  type TextSprite,
} from "../src/scene-text";

interface DrawnLine {
  text: string;
  x: number;
  y: number;
}
interface TextCanvas {
  width: number;
  height: number;
  lines: DrawnLine[];
  font: string;
}

// Deterministic glyph metrics test wrapping and geometry, not visual rendering.
function fixture() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvases: TextCanvas[] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => {
        const lines: DrawnLine[] = [];
        const context = {
          font: "",
          textAlign: "",
          textBaseline: "",
          fillStyle: "",
          clearRect: () => lines.splice(0),
          fillText: (text: string, x: number, y: number) =>
            lines.push({ text, x, y }),
          measureText: (text: string) => {
            const size = context.font.match(/(\d+)px/);
            assert.ok(size);
            return {
              width: Array.from(text).reduce(
                (width, character) =>
                  width +
                  Number(size[1]) *
                    (/\s/.test(character)
                      ? 0.25
                      : /[\x00-\x7f]/.test(character)
                        ? 0.5
                        : 1),
                0,
              ),
            };
          },
        };
        const canvas = {
          width: 0,
          height: 0,
          lines,
          get font() {
            return context.font;
          },
          getContext: () => context,
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  return {
    canvas: (sprite: TextSprite): TextCanvas => {
      const canvas = canvases.find(
        (canvas) => canvas === sprite.material.map!.image,
      );
      assert.ok(canvas);
      return canvas;
    },
    close: () => {
      if (previous) Object.defineProperty(globalThis, "document", previous);
      else Reflect.deleteProperty(globalThis, "document");
    },
  };
}

test("labels have two-times raster resolution, centered text and absolute sizing", () => {
  const f = fixture();
  try {
    const sprite = textSprite("小火烤干 · 勿久留", "#bcc9d7", 0.5);
    const canvas = f.canvas(sprite);
    assert.equal(canvas.width, 1280);
    assert.equal(canvas.height, 120);
    assert.match(canvas.font, /64px/);
    assert.equal(SPRITE_FONT_HEIGHT, 0.32);
    assert.deepEqual(canvas.lines, [
      { text: "小火烤干 · 勿久留", x: 640, y: 60 },
    ]);
    assert.equal(sprite.textHeight, 32);
    setSpriteTextScale(sprite, 1.4);
    assert.equal(sprite.scale.x, 6.4 * 1.4);
    assert.equal(sprite.scale.y, 0.6 * 1.4);
    setSpriteTextScale(sprite, 1);
    assert.equal(sprite.scale.x, 6.4);
    assert.equal(sprite.scale.y, 0.6);
  } finally {
    f.close();
  }
});

test("Chinese wraps at glyph boundaries and reserves all known language variants", () => {
  const f = fixture();
  try {
    const text = "纸".repeat(20);
    const sprite = textSprite("灯", undefined, 1, ["灯", text]);
    const texture = sprite.material.map!;
    const canvas = f.canvas(sprite);
    const dimensions = [canvas.width, canvas.height];
    writeSpriteText(sprite, text, "#ffffff");
    assert.deepEqual(
      canvas.lines.map((line) => line.text),
      ["纸".repeat(18), "纸".repeat(2)],
    );
    assert.equal(sprite.textWidth, 576);
    assert.equal(sprite.textHeight, 76);
    assert.equal(canvas.lines[1].y - canvas.lines[0].y, 88);
    writeSpriteText(sprite, "灯", "#ffffff");
    assert.equal(sprite.material.map, texture);
    assert.deepEqual([canvas.width, canvas.height], dimensions);
    assert.equal(sprite.textWidth, 32);
    assert.equal(sprite.textHeight, 32);
    assert.equal(canvas.lines[0].y, canvas.height / 2);
  } finally {
    f.close();
  }
});

test("English preserves words, explicit newlines and all text in overlong words", () => {
  const f = fixture();
  try {
    const words = "follow the warm lanterns before the rain stops "
      .repeat(4)
      .trim();
    const wordSprite = textSprite(words);
    const wordLines = f.canvas(wordSprite).lines.map((line) => line.text);
    assert.ok(wordLines.length > 1);
    assert.equal(wordLines.join(" "), words);
    assert.ok(
      wordLines.every(
        (line) =>
          Array.from(line).reduce(
            (width, character) => width + (character === " " ? 8 : 16),
            0,
          ) <= 600,
      ),
    );
    const longWord = "abcdefghijklmnopqrstuvwxyz".repeat(3);
    const sprite = textSprite(longWord);
    const lines = f.canvas(sprite).lines.map((line) => line.text);
    assert.ok(lines.length > 1);
    assert.equal(lines.join(""), longWord);
    assert.ok(lines.every((line) => line.length <= 37));
    const multiline = textSprite("one\n\ntwo");
    assert.deepEqual(
      f.canvas(multiline).lines.map((line) => line.text),
      ["one", "", "two"],
    );
  } finally {
    f.close();
  }
});

test("resizing text does not upload textures and missing layout variants fail explicitly", () => {
  const f = fixture();
  try {
    const sprite = textSprite("灯");
    const texture = sprite.material.map!;
    const version = texture.version;
    const canvas = f.canvas(sprite);
    setSpriteTextScale(sprite, 1.2);
    setSpriteTextScale(sprite, 1.4);
    assert.equal(texture.version, version);
    assert.throws(
      () => writeSpriteText(sprite, "纸".repeat(40), "#fff"),
      /reserved sprite canvas/,
    );
    assert.equal(sprite.material.map, texture);
    assert.deepEqual([canvas.width, canvas.height], [1280, 120]);
    assert.equal(canvas.lines[0].text, "灯");
  } finally {
    f.close();
  }
});
