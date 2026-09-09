import * as THREE from "three";
import type { Platform, Point } from "./game";

export type PlatformLayer = "active" | "front" | "back";
/** Fractional views follow the actual camera turn. A small exit/entry gap keeps
 * network position jitter from repeatedly switching a platform's layer. */
export function platformLayer(
  platform: Platform,
  player: Point,
  view: number,
  previous?: PlatformLayer,
): PlatformLayer {
  const x = Math.sin((view * Math.PI) / 2),
    z = Math.cos((view * Math.PI) / 2);
  const offset = (platform.x - player.x) * x + (platform.z - player.z) * z;
  const span = Math.abs(x) * platform.w + Math.abs(z) * platform.d;
  const margin = previous === "active" ? 0.16 : previous ? -0.16 : 0;
  if (Math.abs(offset) <= span / 2 + 0.45 + margin) return "active";
  return offset > 0 ? "front" : "back";
}

/** Graph-color intersecting swept boxes, keeping depth offsets small even in a
 * large editor map. Geometry and collisions retain their original coordinates. */
export function surfacePriorities(platforms: readonly Platform[]): number[] {
  const bounds = platforms.map((p) => {
    const rx = p.motion?.axis === "x" ? p.motion.range : 0;
    const rz = p.motion?.axis === "z" ? p.motion.range : 0;
    return [
      p.x - p.w / 2 - rx,
      p.x + p.w / 2 + rx,
      p.y - p.h,
      p.y,
      p.z - p.d / 2 - rz,
      p.z + p.d / 2 + rz,
    ];
  });
  const ranks: number[] = [];
  bounds.forEach((a, i) => {
    const used = new Set<number>();
    for (let j = 0; j < i; j++) {
      const b = bounds[j];
      if (
        [0, 2, 4].every(
          (axis) =>
            a[axis] <= b[axis + 1] + 0.001 && b[axis] <= a[axis + 1] + 0.001,
        )
      )
        used.add(ranks[j]);
    }
    let rank = 0;
    while (used.has(rank)) rank++;
    ranks.push(rank);
  });
  return ranks;
}

export function stableNearbyLight<T extends { position: THREE.Vector3 }>(
  current: T | null,
  candidates: readonly T[],
  viewer: THREE.Vector3,
): T | null {
  let nearest: T | null = null;
  for (const light of candidates)
    if (
      !nearest ||
      light.position.distanceToSquared(viewer) <
        nearest.position.distanceToSquared(viewer)
    )
      nearest = light;
  if (
    current &&
    candidates.includes(current) &&
    nearest &&
    current.position.distanceTo(viewer) <
      nearest.position.distanceTo(viewer) + 0.6
  )
    return current;
  return nearest;
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
