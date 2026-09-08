import * as THREE from "three";
import { bankPoint, type BridgeCrossing } from "./bridges";
import type { SocketState } from "./mechanism-state";

export function bridgeSocket(
  crossing: BridgeCrossing,
  side: -1 | 1,
): THREE.Group {
  const group = new THREE.Group();
  const bank = bankPoint(crossing, side);
  group.position.set(bank.x, bank.y, bank.z);
  const material = new THREE.MeshStandardMaterial({
    color: "#c5a075",
    roughness: 0.9,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.53, 0.07, 6, 24),
    material,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.09;
  group.add(ring);
  for (const edge of [-1, 1]) {
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 0.35, 6),
      material,
    );
    pin.position.set(
      crossing.axis === "z" ? edge * 0.65 : 0,
      0.17,
      crossing.axis === "x" ? edge * 0.65 : 0,
    );
    group.add(pin);
  }
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 24),
    new THREE.MeshBasicMaterial({
      color: "#89e0d6",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.055;
  fill.name = "alignment-fill";
  fill.visible = false;
  group.add(fill);
  return group;
}

export function animateBridgeSocket(
  group: THREE.Group,
  state: SocketState,
  ghost: boolean,
) {
  const key = `${state}:${ghost}`;
  if (group.userData.feedback === key) return;
  group.userData.feedback = key;
  const color =
    state === "aligned"
      ? "#89e0d6"
      : state === "holding"
        ? "#ffe1a0"
        : state === "complete"
          ? "#91aead"
          : "#c5a075";
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name === "alignment-fill") {
      o.visible = !ghost && (state === "aligned" || state === "holding");
      return;
    }
    const material = o.material as THREE.MeshStandardMaterial;
    material.color.set(color);
    material.emissive.set(
      state === "aligned" || state === "holding" ? color : "#000000",
    );
    material.emissiveIntensity = 0.55;
    material.transparent = ghost;
    material.opacity = ghost ? 0.12 : 1;
    material.depthWrite = !ghost;
  });
}
