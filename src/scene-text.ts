import * as THREE from "three";

/** Labels keep their canvas, texture and sprite while language/layout changes.
 * A copy change must not rebuild terrain, lights or animation state. */
export function writeSpriteText(
  sprite: THREE.Sprite,
  text: string,
  color: string,
) {
  const texture = sprite.material.map as THREE.CanvasTexture;
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '500 32px "PingFang SC", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 320, 48);
  texture.needsUpdate = true;
}

export function textSprite(text: string, color = "#d6d9dc", scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(6.4 * scale, 0.96 * scale, 1);
  writeSpriteText(sprite, text, color);
  return sprite;
}
