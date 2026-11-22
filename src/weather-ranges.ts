import * as THREE from "three";
import type { Level } from "./game";
import { rainFloorAt, type RainCover } from "./rain-occlusion";
import type { Weather } from "./weather";

/** The rain volume is the union of wet XZ regions above their real rain covers.
 * Partition once at their boundaries, then emit only the exterior surfaces;
 * overlapping zones and adjoining cells do not stack translucent faces. */
function rainGeometry(
  weather: Weather,
  covers: readonly RainCover[],
  top: number,
  ground: number,
) {
  const zones = weather.zones.filter((zone) => zone.rate > 0);
  const geometry = new THREE.BufferGeometry();
  if (!zones.length)
    return geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([], 3),
    );
  const xmin = Math.min(...zones.map((zone) => zone.x - zone.w / 2));
  const xmax = Math.max(...zones.map((zone) => zone.x + zone.w / 2));
  const zmin = Math.min(...zones.map((zone) => zone.z - zone.d / 2));
  const zmax = Math.max(...zones.map((zone) => zone.z + zone.d / 2));
  const xs = new Set<number>();
  const zs = new Set<number>();
  // Deduplicate at the GPU buffer's precision, so decimal map coordinates do
  // not create zero-width cells after conversion from JS doubles to float32.
  for (const box of [...zones, ...covers]) {
    xs.add(Math.fround(Math.max(xmin, Math.min(xmax, box.x - box.w / 2))));
    xs.add(Math.fround(Math.max(xmin, Math.min(xmax, box.x + box.w / 2))));
    zs.add(Math.fround(Math.max(zmin, Math.min(zmax, box.z - box.d / 2))));
    zs.add(Math.fround(Math.max(zmin, Math.min(zmax, box.z + box.d / 2))));
  }
  const x = [...xs].sort((a, b) => a - b);
  const z = [...zs].sort((a, b) => a - b);
  const width = x.length - 1;
  const depth = z.length - 1;
  const floors = new Float64Array(width * depth).fill(top);
  for (let iz = 0; iz < depth; iz++)
    for (let ix = 0; ix < width; ix++) {
      const center = { x: (x[ix] + x[ix + 1]) / 2, z: (z[iz] + z[iz + 1]) / 2 };
      if (
        zones.some(
          (zone) =>
            Math.abs(center.x - zone.x) < zone.w / 2 &&
            Math.abs(center.z - zone.z) < zone.d / 2,
        )
      )
        floors[iz * width + ix] = Math.fround(
          rainFloorAt(center, covers, ground),
        );
    }
  const vertices: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let iz = 0; iz < depth; iz++)
    for (let ix = 0; ix < width; ix++) {
      const y = floors[iz * width + ix];
      if (y === top) continue;
      const x0 = x[ix],
        x1 = x[ix + 1],
        z0 = z[iz],
        z1 = z[iz + 1];
      quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);
      const left = ix === 0 ? top : floors[iz * width + ix - 1];
      const right = ix === width - 1 ? top : floors[iz * width + ix + 1];
      const front = iz === 0 ? top : floors[(iz - 1) * width + ix];
      const back = iz === depth - 1 ? top : floors[(iz + 1) * width + ix];
      if (left > y)
        quad([x0, y, z0], [x0, y, z1], [x0, left, z1], [x0, left, z0]);
      if (right > y)
        quad([x1, y, z1], [x1, y, z0], [x1, right, z0], [x1, right, z1]);
      if (front > y)
        quad([x1, y, z0], [x0, y, z0], [x0, front, z0], [x1, front, z0]);
      if (back > y)
        quad([x0, y, z1], [x1, y, z1], [x1, back, z1], [x0, back, z1]);
    }
  return geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
}

/** Optional, crisp translucent range surfaces. No lights, textures or bloom;
 * only moving covers use a small shader array, fixed roofs are baked above. */
export class WeatherRanges extends THREE.Group {
  readonly rain: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly winds = new THREE.Group();
  private readonly coverBounds: THREE.Vector4[];
  private readonly coverTops: Float32Array;

  constructor(
    level: Level,
    weather: Weather,
    covers: readonly RainCover[],
    movingCoverCapacity: number,
  ) {
    super();
    this.name = "weather-ranges";
    this.visible = false;
    this.coverBounds = Array.from(
      { length: movingCoverCapacity },
      () => new THREE.Vector4(),
    );
    this.coverTops = new Float32Array(movingCoverCapacity);
    const top =
      Math.max(
        level.spawn.y,
        level.exit.y,
        ...level.platforms.map((p) => p.y),
        ...level.winds.map((wind) => wind.y + wind.height),
        ...covers.map((cover) => cover.top),
      ) + 14;
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {
        tint: { value: new THREE.Color("#91bdcf") },
        alpha: { value: 0.09 },
        coverCount: { value: 0 },
        coverBounds: { value: this.coverBounds },
        coverTops: { value: this.coverTops },
      },
      vertexShader: `
        varying vec3 worldPoint;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          worldPoint = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 tint;
        uniform float alpha;
        uniform int coverCount;
        uniform vec4 coverBounds[${movingCoverCapacity}];
        uniform float coverTops[${movingCoverCapacity}];
        varying vec3 worldPoint;
        void main() {
          for (int i = 0; i < ${movingCoverCapacity}; i++) {
            if (i >= coverCount) break;
            vec4 cover = coverBounds[i];
            if (abs(worldPoint.x - cover.x) < cover.z &&
                abs(worldPoint.z - cover.y) < cover.w &&
                worldPoint.y < coverTops[i]) discard;
          }
          gl_FragColor = vec4(tint, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const ground = Math.min(...level.platforms.map((platform) => platform.y));
    this.rain = new THREE.Mesh(
      rainGeometry(weather, covers, top, ground),
      material,
    );
    this.rain.name = "rain-range";
    this.add(this.rain, this.winds);
    if (level.winds.length) {
      const windGeometry = new THREE.BoxGeometry(1, 1, 1);
      const windMaterial = new THREE.MeshBasicMaterial({
        color: "#d1b768",
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.BackSide,
      });
      for (const wind of level.winds) {
        const mesh = new THREE.Mesh(windGeometry, windMaterial);
        mesh.name = "wind-range";
        mesh.position.set(wind.x, wind.y + (wind.height - 0.2) / 2, wind.z);
        mesh.scale.set(wind.w, wind.height + 0.2, wind.d);
        this.winds.add(mesh);
      }
    }
  }

  update(strength: number, movingCovers: readonly RainCover[]) {
    if (!this.visible) return;
    const uniforms = this.rain.material.uniforms;
    uniforms.alpha.value = 0.07 * strength;
    uniforms.coverCount.value = movingCovers.length;
    for (let i = 0; i < movingCovers.length; i++) {
      const cover = movingCovers[i];
      this.coverBounds[i].set(cover.x, cover.z, cover.w / 2, cover.d / 2);
      this.coverTops[i] = cover.top;
    }
  }
}
