import * as THREE from "three";
const mat = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });
export function campfire(
  width = 0.65,
  depth = 0.65,
  blazing = false,
): THREE.Group {
  const fire = new THREE.Group();
  fire.userData.blazing = blazing;
  const bed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.55, 0.1, 12),
    mat("#352c2a"),
  );
  bed.scale.set(width * (blazing ? 1 : 1.35), 1, depth * (blazing ? 1 : 1.35));
  bed.position.y = 0.03;
  fire.add(bed);
  for (let i = 0; i < 10; i++) {
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.11, 0),
      mat("#696367"),
    );
    stone.position.set(
      Math.cos((i * Math.PI) / 5) * width * (blazing ? 0.49 : 0.65),
      0.08,
      Math.sin((i * Math.PI) / 5) * depth * (blazing ? 0.49 : 0.65),
    );
    stone.scale.set(1, 0.65, 1);
    fire.add(stone);
  }
  for (const angle of [-0.6, 0.6]) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, width * 1.15, 7),
      mat("#61402c"),
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = angle;
    log.position.y = 0.14;
    fire.add(log);
  }
  const flameGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.17, 0.08),
      new THREE.Vector2(0.2, 0.23),
      new THREE.Vector2(0.13, 0.45),
      new THREE.Vector2(0.07, 0.62),
      new THREE.Vector2(0, 0.86),
    ],
    7,
  );
  const count = blazing ? Math.ceil(depth / 0.4) * 2 : 3;
  for (let i = 0; i < count; i++) {
    const flame = new THREE.Group();
    const skin = new THREE.Mesh(
      flameGeometry,
      new THREE.MeshBasicMaterial({
        color: blazing ? "#ff662b" : "#ffad49",
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
      }),
    );
    const core = new THREE.Mesh(
      flameGeometry,
      new THREE.MeshBasicMaterial({ color: "#ffe4a0" }),
    );
    core.scale.set(0.55, 0.66, 0.55);
    core.position.y = 0.025;
    flame.add(skin, core);
    flame.position.set(
      blazing ? ((i % 2) - 0.5) * width * 0.5 : Math.sin(i * 2.1) * 0.18,
      0.1,
      blazing
        ? (Math.floor(i / 2) - (count / 2 - 1) / 2) * 0.4
        : Math.cos(i * 2.1) * 0.18,
    );
    flame.userData.phase = i * 1.91;
    flame.userData.base = blazing ? 1.1 : 0.68 + i * 0.11;
    flame.name = "flame";
    fire.add(flame);
  }
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(blazing ? Math.max(width, depth) * 0.7 : 1.45, 32),
    new THREE.MeshBasicMaterial({
      color: blazing ? "#f27732" : "#e4af65",
      transparent: true,
      opacity: blazing ? 0.1 : 0.06,
      depthWrite: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.name = "halo";
  halo.position.y = 0.012;
  fire.add(halo);
  if (!blazing) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.42, 1.45, 48),
      new THREE.MeshBasicMaterial({
        color: "#d4a665",
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.018;
    fire.add(ring);
  }
  for (let i = 0; i < (blazing ? 12 : 5); i++) {
    const spark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.025),
      new THREE.MeshBasicMaterial({ color: "#ffd28a", transparent: true }),
    );
    spark.name = "spark";
    spark.userData.phase = i * 0.173;
    fire.add(spark);
  }
  return fire;
}
export function animateFire(
  fire: THREE.Group,
  time: number,
  active = true,
): void {
  fire.userData.active = active;
  const blazing = fire.userData.blazing;
  fire.children.forEach((o) => {
    if (["flame", "spark", "halo"].includes(o.name)) o.visible = active;
    if (o.name === "flame") {
      const phase = o.userData.phase,
        base = o.userData.base;
      o.scale.set(
        0.9 + Math.sin(time * 9 + phase) * 0.13,
        base * (1 + Math.sin(time * 11 + phase) * 0.13),
        0.85 + Math.cos(time * 7 + phase) * 0.1,
      );
      o.rotation.z = Math.sin(time * 5 + phase) * 0.1;
      o.rotation.x = Math.sin(time * 4 + phase) * 0.1;
    } else if (o.name === "spark") {
      const phase = o.userData.phase,
        life = (time * (blazing ? 0.65 : 0.4) + phase) % 1;
      o.position.set(
        Math.sin(phase * 23 + time) * 0.25 * life,
        0.2 + life * (blazing ? 2.2 : 1.25),
        Math.cos(phase * 41) * 0.2,
      );
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
        (1 - life) * 0.8;
    }
  });
}
