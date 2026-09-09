import * as THREE from "three";
import { LEVELS } from "../../src/game";
import {
  platformVisual,
  surfacePriorities,
  disposeObjectTree,
} from "../../src/scene-resources";
import { stabilizeTerrain } from "../../src/terrain-scene";

/** GPU regression on real overlapping top faces, without rain/fire animation.
 * Contrasting materials expose which of two coplanar surfaces wins each frame. */
export async function probeTerrain() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const target = new THREE.WebGLRenderTarget(16, 16);
  const camera = new THREE.OrthographicCamera(
    -0.01,
    0.01,
    0.01,
    -0.01,
    0.1,
    140,
  );
  const pixel = new Uint8Array(4);
  let pairs = 0,
    unstableBefore = 0,
    unstableAfter = 0;
  const failures: string[] = [];
  renderer.setRenderTarget(target);
  try {
    for (const [levelIndex, level] of LEVELS.entries()) {
      const platforms = level.platforms.map(platformVisual),
        ranks = surfacePriorities(platforms);
      for (let i = 0; i < platforms.length; i++)
        for (let j = i + 1; j < platforms.length; j++) {
          const a = platforms[i],
            b = platforms[j];
          if (a.motion || b.motion || Math.abs(a.y - b.y) > 0.0001) continue;
          const x0 = Math.max(a.x - a.w / 2, b.x - b.w / 2),
            x1 = Math.min(a.x + a.w / 2, b.x + b.w / 2);
          const z0 = Math.max(a.z - a.d / 2, b.z - b.d / 2),
            z1 = Math.min(a.z + a.d / 2, b.z + b.d / 2);
          if (x1 - x0 < 0.03 || z1 - z0 < 0.03) continue;
          pairs++;
          const scene = new THREE.Scene(),
            roots = [a, b].map((p, k) => {
              const root = new THREE.Group();
              const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(p.w, p.h, p.d),
                new THREE.MeshBasicMaterial({
                  color: k ? "#0000ff" : "#ff0000",
                  toneMapped: false,
                }),
              );
              mesh.position.y = -p.h / 2;
              root.position.set(p.x, p.y, p.z);
              root.add(mesh);
              scene.add(root);
              return root;
            });
          const colors = [new Set<string>(), new Set<string>()];
          for (let pass = 0; pass < 2; pass++) {
            if (pass)
              roots.forEach((root, k) =>
                stabilizeTerrain(root, ranks[k ? j : i], k ? j : i),
              );
            for (let frame = 0; frame < 32; frame++) {
              const angle = (((frame % 4) / 3) * Math.PI) / 2,
                jitter = (frame % 2 ? 1 : -1) * 0.0001 * (1 + frame / 32);
              const focus = new THREE.Vector3(
                (x0 + x1) / 2,
                a.y,
                (z0 + z1) / 2,
              );
              camera.position
                .copy(focus)
                .add(
                  new THREE.Vector3(
                    Math.sin(angle) * 32 + jitter,
                    7.5 + jitter,
                    Math.cos(angle) * 32 - jitter,
                  ),
                );
              camera.lookAt(focus);
              renderer.render(scene, camera);
              renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel);
              colors[pass].add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
            }
          }
          if (colors[0].size > 1) unstableBefore++;
          if (colors[1].size > 1) {
            unstableAfter++;
            failures.push(`${levelIndex + 1}:${i}/${j}`);
          }
          roots.forEach(disposeObjectTree);
        }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    return { pairs, unstableBefore, unstableAfter, failures };
  } finally {
    target.dispose();
    renderer.dispose();
  }
}
