import * as THREE from "three";
import { styleTerrainDepth } from "../../src/terrain-scene";
import { SceneryOcclusion } from "../../src/scenery-occlusion";
import { disposeObjectTree } from "../../src/scene-resources";

// Reproduce the actual GPU failure: first compile an opaque material, then
// rotate/walk behind it. Checking material.opacity alone misses a stale OPAQUE shader.
export function probeTransparency() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const target = new THREE.WebGLRenderTarget(8, 8);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.set(0, 0, 5);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0000ff");
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: "#ff0000" });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
  scene.add(root);
  const pixel = new Uint8Array(4),
    failures: string[] = [];
  let checks = 0;
  const check = (label: string, faded: boolean) => {
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 4, 4, 1, 1, pixel);
    checks++;
    if (
      faded ? pixel[2] < 180 || pixel[0] > 100 : pixel[0] < 220 || pixel[2] > 20
    )
      failures.push(`${label}: ${pixel.slice(0, 3).join(",")}`);
  };
  renderer.setRenderTarget(target);
  try {
    const platform = { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 };
    for (let cycle = 0; cycle < 3; cycle++) {
      styleTerrainDepth(root, platform, { x: 0, y: 0, z: 0 }, 0, false, 1);
      check(`terrain opaque ${cycle}`, false);
      styleTerrainDepth(root, platform, { x: 0, y: 0, z: -5 }, 0, false, 1);
      check(`terrain faded ${cycle}`, true);
    }
    styleTerrainDepth(root, platform, { x: 0, y: 0, z: 0 }, 0, false, 1);
    const decorations = new SceneryOcclusion();
    decorations.add(root);
    for (let cycle = 0; cycle < 3; cycle++) {
      decorations.update([], new THREE.Vector3(0, 0, 1), 1);
      check(`roof opaque ${cycle}`, false);
      decorations.update(
        [new THREE.Vector3(0, 0, -3)],
        new THREE.Vector3(0, 0, 1),
        1,
      );
      check(`roof faded ${cycle}`, true);
    }
    return { checks, failures };
  } finally {
    disposeObjectTree(root);
    target.dispose();
    renderer.dispose();
  }
}
