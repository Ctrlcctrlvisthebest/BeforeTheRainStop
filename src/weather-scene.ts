import * as THREE from "three";
import type { Level, Point } from "./game";
import type { Weather } from "./weather";
import { rainFloorAt, type RainCover } from "./rain-occlusion";

const fract = (n: number) => n - Math.floor(n);
const dynamic = (count: number) =>
  new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(
    THREE.DynamicDrawUsage,
  );

/** Local, bounded rain coverage: a large map must not dilute its visible rain.
 * Geometry is allocated once; moving roofs and paper shields remain real covers. */
export class RainCurtain extends THREE.Group {
  private readonly dropCount = 560;
  private readonly drops = dynamic(this.dropCount * 2);
  private readonly contacts = dynamic(this.dropCount * 4);
  private readonly seeds: {
    x: number;
    z: number;
    floor: number;
    phase: number;
    speed: number;
    strength: number;
  }[] = [];
  private readonly ink = new THREE.LineBasicMaterial({
    color: "#acbdc6",
    transparent: true,
    opacity: 0.48,
    vertexColors: true,
    depthWrite: false,
  });
  private readonly contactInk = new THREE.LineBasicMaterial({
    color: "#acbdc6",
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  private anchorX = Infinity;
  private anchorZ = Infinity;

  constructor(
    private readonly weather: Weather,
    private readonly covers: readonly RainCover[],
  ) {
    super();
    this.name = "rain-curtain";
    const colors = new Float32Array(this.dropCount * 6);
    for (let i = 0; i < this.dropCount; i++) {
      const shade = 0.42 + (i % 3) * 0.2;
      colors.fill(shade * 0.18, i * 6, i * 6 + 3);
      colors.fill(shade, i * 6 + 3, i * 6 + 6);
    }
    const geometry = new THREE.BufferGeometry()
      .setAttribute("position", this.drops)
      .setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const rain = new THREE.LineSegments(geometry, this.ink);
    const splashes = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", this.contacts),
      this.contactInk,
    );
    rain.frustumCulled = splashes.frustumCulled = false;
    splashes.name = "rain-contacts";
    this.add(rain, splashes);
  }

  update(
    time: number,
    focus: Point,
    strength: number,
    movingCovers: readonly RainCover[],
    reducedMotion = false,
  ) {
    const ax = Math.floor(focus.x / 6) * 6,
      az = Math.floor(focus.z / 6) * 6;
    if (ax !== this.anchorX || az !== this.anchorZ) {
      this.anchorX = ax;
      this.anchorZ = az;
      const zones = this.weather.zones
        .map((z) => ({
          x0: Math.max(z.x - z.w / 2, ax - 23),
          x1: Math.min(z.x + z.w / 2, ax + 23),
          z0: Math.max(z.z - z.d / 2, az - 23),
          z1: Math.min(z.z + z.d / 2, az + 23),
          rate: z.rate,
        }))
        .filter((z) => z.x1 > z.x0 && z.z1 > z.z0 && z.rate > 0);
      this.visible = zones.length > 0;
      if (!this.visible) return;
      this.seeds.length = 0;
      for (let i = 0; i < this.dropCount; i++) {
        const zone = zones[i % zones.length];
        const x = THREE.MathUtils.lerp(
          zone.x0,
          zone.x1,
          fract(i * 0.61803398875),
        );
        const z = THREE.MathUtils.lerp(
          zone.z0,
          zone.z1,
          fract(i * 0.41421356237),
        );
        this.seeds.push({
          x,
          z,
          floor: rainFloorAt({ x, z }, this.covers),
          phase: fract(i * 0.754877666),
          speed: 0.7 + (i % 7) * 0.09,
          strength: Math.min(1, zone.rate / 12),
        });
      }
    }
    if (!this.visible) return;
    const t = reducedMotion ? 1.7 : time;
    this.ink.opacity = reducedMotion ? 0.22 : strength > 1 ? 0.62 : 0.4;
    this.contactInk.opacity = reducedMotion ? 0 : 0.18 * strength;
    this.seeds.forEach((seed, i) => {
      const floor = rainFloorAt(seed, movingCovers, seed.floor);
      const bottom = Math.max(floor, focus.y - 8);
      const top = Math.max(focus.y + 13, bottom + 8);
      const phase = fract(t * seed.speed * 0.6 + seed.phase);
      const y = top - phase * (top - bottom);
      const length = (0.13 + (i % 3) * 0.12) * Math.min(1.4, strength);
      const active = fract(i * 0.371) < Math.max(0.3, seed.strength * strength);
      this.drops.setXYZ(i * 2, seed.x, y, seed.z);
      this.drops.setXYZ(
        i * 2 + 1,
        seed.x,
        active ? Math.max(bottom, y - length) : y,
        seed.z,
      );
      // A brief V-shaped contact only on a real surface, never midair at the
      // bottom of the camera's rain window. Water below the map stays implied.
      const hit =
        floor > -2.5 && floor >= focus.y - 8 && active && phase > 0.91;
      const r = hit ? (phase - 0.91) * 1.3 : 0;
      const lift = hit ? Math.sin(((phase - 0.91) / 0.09) * Math.PI) * 0.09 : 0;
      this.contacts.setXYZ(i * 4, seed.x - r, floor + 0.03 + lift, seed.z);
      this.contacts.setXYZ(i * 4 + 1, seed.x, floor + 0.03, seed.z);
      this.contacts.setXYZ(i * 4 + 2, seed.x, floor + 0.03, seed.z);
      this.contacts.setXYZ(i * 4 + 3, seed.x + r, floor + 0.03 + lift, seed.z);
    });
    this.drops.needsUpdate = this.contacts.needsUpdate = true;
  }
}

// Angular leaf outline, a raised midrib, and a short narrow stem.
const LEAF_OUTLINE = [
  [0, -0.75, 0],
  [-0.65, -0.35, 0],
  [-1, 0.25, 0],
  [0, 1, 0],
  [0.75, 0.35, 0],
  [0.55, -0.4, 0],
] as const;
const LEAF_FACES: readonly (readonly number[])[] = [
  ...LEAF_OUTLINE.flatMap((point, i) => [
    [0, 0, 1],
    point,
    LEAF_OUTLINE[(i + 1) % LEAF_OUTLINE.length],
  ]),
  [-0.07, -0.65, 0],
  [0.07, -0.65, 0],
  [-0.14, -1.15, 0],
  [0.07, -0.65, 0],
  [0, -1.15, 0],
  [-0.14, -1.15, 0],
];

/** Sparse leaves caught in an updraft, with crisp polygon edges. */
export class WindLeaves extends THREE.Group {
  private readonly pieces = 5;
  private readonly vertices: THREE.BufferAttribute;
  constructor(private readonly winds: Level["winds"]) {
    super();
    this.name = "wind-leaves";
    this.vertices = dynamic(winds.length * this.pieces * LEAF_FACES.length);
    const colors = new Float32Array(this.vertices.count * 3);
    const light = new THREE.Color("#d6b45b");
    const shade = new THREE.Color("#a88940");
    for (let i = 0; i < this.vertices.count; i++) {
      const face = Math.floor((i % LEAF_FACES.length) / 3);
      const color = face < 3 ? light : shade;
      color.toArray(colors, i * 3);
    }
    const geometry = new THREE.BufferGeometry()
      .setAttribute("position", this.vertices)
      .setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const leaves = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    );
    leaves.frustumCulled = false;
    this.add(leaves);
  }
  update(time: number, reducedMotion = false) {
    const t = reducedMotion ? 1.7 : time;
    this.winds.forEach((w, wi) => {
      for (let piece = 0; piece < this.pieces; piece++) {
        const h = fract(t * 0.24 + piece / this.pieces);
        const scale = 0.75 * Math.min(1, h / 0.12, (1 - h) / 0.12);
        const phase = piece * 2.399;
        const angle = phase + Math.sin(t * 0.8 + phase) * 0.35;
        const x =
          w.x +
          Math.sin(phase) * w.w * 0.24 +
          Math.sin(t * 0.6 + phase) * w.w * 0.035;
        const z =
          w.z +
          Math.cos(phase) * w.d * 0.24 +
          Math.cos(t * 0.6 + phase) * w.d * 0.035;
        const leafLength = Math.min(
          0.27,
          w.height * 0.08,
          w.w * 0.16,
          w.d * 0.16,
        );
        const margin = leafLength * 1.3 + 0.02;
        const y = w.y + margin + h * (w.height - margin * 2);
        const width = Math.min(0.11, w.w * 0.08, w.d * 0.08) * scale;
        const length = leafLength * scale;
        const tilt = Math.sin(t * 1.3 + phase) * 0.35;
        const ridge = width * 0.38;
        // The two ochre tones meet at the midrib; tilt and yaw gently flutter the leaf.
        for (let i = 0; i < LEAF_FACES.length; i++) {
          const [px, py, pz] = LEAF_FACES[i];
          const dx = px * width * Math.cos(tilt) - py * length * Math.sin(tilt),
            dy = px * width * Math.sin(tilt) + py * length * Math.cos(tilt),
            dz = pz * ridge;
          this.vertices.setXYZ(
            (wi * this.pieces + piece) * LEAF_FACES.length + i,
            x + dx * Math.cos(angle) + dz * Math.sin(angle),
            y + dy,
            z - dx * Math.sin(angle) + dz * Math.cos(angle),
          );
        }
      }
    });
    this.vertices.needsUpdate = true;
  }
}
