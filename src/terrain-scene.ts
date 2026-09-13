import * as THREE from "three";
import type { Platform, Point } from "./game";
import { platformLayer, setMaterialTransparency } from "./scene-resources";

const distantTint = new THREE.Color("#74899e");
const activeEdge = new THREE.Color("#e4d1aa"),
  otherEdge = new THREE.Color("#7b90a4");

/** A fixed depth tie-breaker for intersecting faces and fixed ordering for
 * translucent cutaways, which must not swap when their center depths cross. */
export function stabilizeTerrain(
  node: THREE.Group,
  priority: number,
  index: number,
) {
  node.traverse((o) => {
    if (o instanceof THREE.Line) o.renderOrder = 2 + index * 0.0001;
    if (!(o instanceof THREE.Mesh)) return;
    o.renderOrder = -10 + index * 0.0001;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = 0;
      m.polygonOffsetUnits = -32 * (priority + 1);
    }
  });
}

function approach(value: number, target: number, dt: number) {
  const next = THREE.MathUtils.damp(value, target, 18, dt);
  return Math.abs(next - target) < 0.001 ? target : next;
}

export function styleTerrainDepth(
  node: THREE.Group,
  platform: Platform,
  player: Point,
  view: number,
  preview: boolean,
  dt: number,
) {
  const state = node.userData;
  const layer = preview
    ? "active"
    : platformLayer(platform, player, view, state.depthLayer);
  const corridor = platform.kind === "low-roof" || platform.kind === "railing";
  const opacityTarget = corridor ? 0.14 : layer === "front" ? 0.09 : 1;
  const tintTarget = layer === "back" ? 1 : 0;
  const edgeTarget = corridor ? 0.16 : layer === "active" ? 0.85 : 0.16;
  const first = state.depthLayer === undefined;
  const opacity = first
    ? opacityTarget
    : approach(state.depthOpacity, opacityTarget, dt);
  const tint = first ? tintTarget : approach(state.depthTint, tintTarget, dt);
  const edge = first ? edgeTarget : approach(state.depthEdge, edgeTarget, dt);
  if (
    !first &&
    layer === state.depthLayer &&
    opacity === state.depthOpacity &&
    tint === state.depthTint &&
    edge === state.depthEdge
  )
    return;
  Object.assign(state, {
    depthLayer: layer,
    depthOpacity: opacity,
    depthTint: tint,
    depthEdge: edge,
  });
  node.traverse((o) => {
    if (o.name === "landing-edge" && o instanceof THREE.Line) {
      const m = o.material as THREE.LineBasicMaterial;
      m.color.copy(otherEdge).lerp(activeEdge, (edge - 0.16) / (0.85 - 0.16));
      m.opacity = edge;
    }
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = !corridor && opacity === 1;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      m.opacity = corridor && o.name === "eave-beam" ? 0.55 : opacity;
      setMaterialTransparency(m, m.opacity < 1);
      m.depthWrite = !m.transparent;
      if (
        m instanceof THREE.MeshStandardMaterial ||
        m instanceof THREE.MeshBasicMaterial
      ) {
        m.userData.baseColor ??= m.color.clone();
        m.color.copy(m.userData.baseColor);
        m.color.r *= 1 + (distantTint.r - 1) * tint;
        m.color.g *= 1 + (distantTint.g - 1) * tint;
        m.color.b *= 1 + (distantTint.b - 1) * tint;
      }
    }
  });
}
