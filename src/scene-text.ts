import * as THREE from "three";

const WIDTH = 640;
const CONTENT_WIDTH = 600;
const FONT_SIZE = 32;
const LINE_HEIGHT = 44;
const PIXEL_RATIO = 2;
const FONT = `500 ${FONT_SIZE * PIXEL_RATIO}px "PingFang SC", sans-serif`;

export const SPRITE_FONT_HEIGHT = FONT_SIZE / 100;
export type TextSprite = THREE.Sprite & {
  textWidth: number;
  textHeight: number;
};

/** Keep words together; an overlong word can still wrap within the canvas. */
function textLines(context: CanvasRenderingContext2D, text: string): string[] {
  const tokens =
    text
      .replace(/\r\n?/g, "\n")
      .match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*|[^\S\n]+|\n|[^\n]/gu) ?? [];
  const lines: string[] = [];
  let line = "";
  const trimEnd = (value: string) => value.replace(/\s+$/u, "");
  const fits = (value: string) =>
    context.measureText(value).width <= CONTENT_WIDTH * PIXEL_RATIO;
  for (const token of tokens) {
    if (token === "\n") {
      lines.push(trimEnd(line));
      line = "";
    } else if (/^\s+$/.test(token)) {
      if (line) line += token;
    } else if (fits(line + token)) {
      line += token;
    } else {
      if (trimEnd(line)) lines.push(trimEnd(line));
      line = "";
      if (fits(token)) line = token;
      else
        for (const character of token) {
          if (line && !fits(line + character)) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
    }
  }
  lines.push(trimEnd(line));
  return lines;
}

/** Labels keep their canvas, texture and sprite while language/layout changes.
 * A copy change must not rebuild terrain, lights or animation state. */
export function writeSpriteText(
  sprite: TextSprite,
  text: string,
  color: string,
) {
  const texture = sprite.material.map as THREE.CanvasTexture;
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.font = FONT;
  const lines = textLines(ctx, text);
  if ((lines.length * LINE_HEIGHT + 16) * PIXEL_RATIO > canvas.height)
    throw new Error("Text exceeds the reserved sprite canvas");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  lines.forEach((line, index) =>
    ctx.fillText(
      line,
      canvas.width / 2,
      canvas.height / 2 +
        (index - (lines.length - 1) / 2) * LINE_HEIGHT * PIXEL_RATIO,
    ),
  );
  sprite.textWidth =
    Math.max(...lines.map((line) => ctx.measureText(line).width)) / PIXEL_RATIO;
  sprite.textHeight = FONT_SIZE + (lines.length - 1) * LINE_HEIGHT;
  texture.needsUpdate = true;
}

/** Set from the original canvas dimensions, so repeated updates do not compound. */
export function setSpriteTextScale(sprite: THREE.Sprite, scale: number) {
  const canvas = sprite.material.map!.image as HTMLCanvasElement;
  sprite.scale.set(
    (canvas.width / PIXEL_RATIO / 100) * scale,
    (canvas.height / PIXEL_RATIO / 100) * scale,
    1,
  );
}

export function textSprite(
  text: string,
  color = "#d6d9dc",
  scale = 1,
  variants: readonly string[] = [text],
): TextSprite {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * PIXEL_RATIO;
  const ctx = canvas.getContext("2d")!;
  ctx.font = FONT;
  const maxLines = Math.max(
    textLines(ctx, text).length,
    ...variants.map((variant) => textLines(ctx, variant).length),
  );
  canvas.height = (maxLines * LINE_HEIGHT + 16) * PIXEL_RATIO;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = Object.assign(
    new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      }),
    ),
    { textWidth: 0, textHeight: 0 },
  );
  setSpriteTextScale(sprite, scale);
  writeSpriteText(sprite, text, color);
  return sprite;
}
