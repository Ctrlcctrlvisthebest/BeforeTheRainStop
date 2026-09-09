import * as THREE from "three";
import type { Platform } from "./game";

const epsilon = 0.0001;
interface Neighbor {
  platform: Platform;
  index: number;
}

/** Keep the boundary of the joined top surfaces, not each box's full rectangle.
 * Coincident outer edges have one owner so they cannot brighten each other. */
export function topOutline(
  p: Platform,
  index: number,
  neighbors: readonly Neighbor[],
): number[] {
  const vertices: number[] = [];
  for (const along of ["x", "z"] as const) {
    const across = along === "x" ? "z" : "x";
    const length = along === "x" ? "w" : "d";
    const width = along === "x" ? "d" : "w";
    for (const side of [-1, 1]) {
      const edge = p[across] + (side * p[width]) / 2;
      let spans: [number, number][] = [
        [p[along] - p[length] / 2, p[along] + p[length] / 2],
      ];
      for (const { platform: other, index: owner } of neighbors) {
        if (Math.abs(p.y - other.y) > epsilon) continue;
        const near = other[across] - other[width] / 2;
        const far = other[across] + other[width] / 2;
        if (near > edge + epsilon || far < edge - epsilon) continue;
        const outside = side < 0 ? near < edge - epsilon : far > edge + epsilon;
        const sameBoundary =
          Math.abs((side < 0 ? near : far) - edge) <= epsilon;
        if (!outside && !(sameBoundary && owner < index)) continue;
        const start = other[along] - other[length] / 2;
        const end = other[along] + other[length] / 2;
        spans = spans.flatMap(([a, b]): [number, number][] => {
          if (end <= a + epsilon || start >= b - epsilon) return [[a, b]];
          const remaining: [number, number][] = [];
          if (start > a + epsilon) remaining.push([a, start]);
          if (end < b - epsilon) remaining.push([end, b]);
          return remaining;
        });
      }
      for (const span of spans)
        for (const position of span)
          vertices.push(
            along === "x" ? position - p.x : edge - p.x,
            0.018,
            along === "z" ? position - p.z : edge - p.z,
          );
    }
  }
  return vertices;
}

interface OutlineEntry {
  node: THREE.Group;
  platform: Platform;
  geometry: THREE.BufferGeometry;
  position: THREE.BufferAttribute;
  neighbors: number[];
  visible?: boolean;
}

/** Static outlines are cached. A moving or appearing deck only rebuilds its
 * own outline and those of platforms it can touch, using reusable GPU buffers. */
export class TerrainEdges {
  private entries: OutlineEntry[];
  private dirty = new Set<number>();

  constructor(sources: readonly { node: THREE.Group; platform: Platform }[]) {
    this.entries = sources.map(({ node, platform }, sourceIndex) => {
      const geometry = (
        node.getObjectByName("landing-edge") as THREE.LineSegments
      ).geometry;
      const neighbors = sources.flatMap(({ platform: other }, index) => {
        if (index === sourceIndex || Math.abs(platform.y - other.y) > epsilon)
          return [];
        const overlaps = (["x", "z"] as const).every((axis) => {
          const extent = axis === "x" ? "w" : "d";
          const movement =
            (platform.motion?.axis === axis ? platform.motion.range : 0) +
            (other.motion?.axis === axis ? other.motion.range : 0);
          return (
            Math.abs(platform[axis] - other[axis]) <=
            (platform[extent] + other[extent]) / 2 + movement + epsilon
          );
        });
        return overlaps ? [index] : [];
      });
      const position = new THREE.BufferAttribute(
        new Float32Array(24 * (neighbors.length + 1)),
        3,
      ).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", position);
      // Every clipped segment stays inside this original platform footprint.
      geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0.018, 0),
        Math.hypot(platform.w, platform.d) / 2,
      );
      return { node, platform: { ...platform }, geometry, position, neighbors };
    });
    this.update();
  }

  update() {
    this.dirty.clear();
    this.entries.forEach((entry, index) => {
      const { node, platform } = entry;
      if (
        platform.x === node.position.x &&
        platform.y === node.position.y &&
        platform.z === node.position.z &&
        entry.visible === node.visible
      )
        return;
      Object.assign(platform, {
        x: node.position.x,
        y: node.position.y,
        z: node.position.z,
      });
      entry.visible = node.visible;
      this.dirty.add(index);
      entry.neighbors.forEach((neighbor) => this.dirty.add(neighbor));
    });
    for (const index of this.dirty) {
      const entry = this.entries[index];
      const neighbors = entry.neighbors.flatMap((other) =>
        this.entries[other].visible
          ? [{ platform: this.entries[other].platform, index: other }]
          : [],
      );
      const vertices = topOutline(entry.platform, index, neighbors);
      entry.position.array.set(vertices);
      entry.position.needsUpdate = true;
      entry.geometry.setDrawRange(0, vertices.length / 3);
    }
  }
}
