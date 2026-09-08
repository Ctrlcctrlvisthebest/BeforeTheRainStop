import * as THREE from "three";
import type { Platform, Point } from "./game";

/** A lane is the full platform span perpendicular to the movement axis. */
export function platformLayer(
  platform: Platform,
  player: Point,
  view: 0 | 1,
): "active" | "front" | "back" {
  const offset = view === 0 ? platform.z - player.z : platform.x - player.x;
  const span = view === 0 ? platform.d : platform.w;
  if (Math.abs(offset) <= span / 2 + 0.45) return "active";
  return offset > 0 ? "front" : "back";
}

/** Project a contact shadow onto real geometry, never across a gap or upward. */
export function landingHeight(player: Point, platforms: readonly Platform[]) {
  let floor: number | undefined;
  for (const p of platforms)
    if (
      p.y <= player.y + 0.06 &&
      Math.abs(player.x - p.x) <= p.w / 2 &&
      Math.abs(player.z - p.z) <= p.d / 2 &&
      (floor === undefined || p.y > floor)
    )
      floor = p.y;
  return floor;
}

export function platformVisual(platform: Platform): Platform {
  if (platform.kind !== "low-roof" && platform.kind !== "railing")
    return platform;
  const h = Math.min(platform.h, platform.kind === "low-roof" ? 0.18 : 1.1);
  return { ...platform, y: platform.y - platform.h + h, h };
}

/** Meshes often share materials and geometry; free every resource only once. */
export function disposeObjectTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points
    )
      geometries.add(object.geometry);
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) {
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) textures.add(value);
  }
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
