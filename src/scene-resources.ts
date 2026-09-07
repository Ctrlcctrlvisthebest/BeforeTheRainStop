import * as THREE from "three";
import type { Platform } from "./game";

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
