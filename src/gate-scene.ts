import * as THREE from "three";

const stone = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });

// The same doorway mark identifies the pressure plate and the gate it opens.
export function gateMark(): THREE.Group {
  const mark = new THREE.Group();
  const ink = new THREE.MeshBasicMaterial({ color: "#eac78d" });
  for (const [w, h, x, y] of [
    [0.65, 0.09, 0, 0.27],
    [0.08, 0.5, -0.22, -0.02],
    [0.08, 0.5, 0.22, -0.02],
    [0.26, 0.06, 0, -0.26],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.016), ink.clone());
    bar.position.set(x, y, 0);
    mark.add(bar);
  }
  return mark;
}

export function gatePad(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.09, 1.3),
    stone("#354551"),
  );
  base.position.y = 0.045;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.1, 1.1),
    stone("#697786"),
  );
  plate.name = "pressure-plate";
  plate.position.y = 0.14;
  const mark = gateMark();
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.06;
  plate.add(mark);
  group.add(base, plate);
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.015, 0.08),
      new THREE.MeshBasicMaterial({ color: "#394854" }),
    );
    tick.name = `gate-second-${i}`;
    tick.position.set((i - 1.5) * 0.27, 0.1, 0.59);
    group.add(tick);
  }
  return group;
}

export function animateGatePad(
  group: THREE.Group,
  pressed: boolean,
  charge: number,
  opened: boolean,
  ghost: boolean,
): void {
  const plate = group.getObjectByName("pressure-plate") as THREE.Mesh;
  plate.position.y = pressed || opened ? 0.085 : 0.14;
  (plate.material as THREE.MeshStandardMaterial).color.set(
    opened ? "#849b9e" : pressed ? "#ae905f" : "#697786",
  );
  for (let i = 0; i < 4; i++) {
    const tick = group.getObjectByName(`gate-second-${i}`) as THREE.Mesh;
    tick.visible = !opened && (pressed || charge > 0);
    (tick.material as THREE.MeshBasicMaterial).color.set(
      opened || charge >= i + 1 ? "#ffe0a0" : "#394854",
    );
  }
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const material = o.material as THREE.Material;
    material.transparent = ghost;
    material.opacity = ghost ? 0.08 : 1;
    material.depthWrite = !ghost;
    o.castShadow = !ghost;
  });
}
