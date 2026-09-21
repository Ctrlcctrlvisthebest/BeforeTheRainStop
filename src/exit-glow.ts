import * as THREE from "three";

/** A warm, translucent doorway visible from either gameplay view. */
export class ExitGlow extends THREE.Group {
  private light = new THREE.PointLight("#ffd45c", 0, 5, 2);
  private material = new THREE.MeshBasicMaterial({
    color: "#ffda68",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private panels: THREE.Mesh[] = [];

  constructor() {
    super();
    this.name = "exit-glow";
    this.light.position.y = 1.65;
    // Keep the light in the scene even when locked: collecting a key should
    // change intensity, not the shader's light count on low-powered GPUs.
    this.add(this.light);
    const geometry = new THREE.PlaneGeometry(1.4, 2.45);
    for (const angle of [0, Math.PI / 2]) {
      const panel = new THREE.Mesh(geometry, this.material);
      panel.position.y = 1.35;
      panel.rotation.y = angle;
      this.panels.push(panel);
      this.add(panel);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.4),
      this.material,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.13;
    this.panels.push(floor);
    this.add(floor);
    this.update(false, 0);
  }

  update(opened: boolean, time: number, reducedMotion = false) {
    const pulse = reducedMotion ? 0 : Math.sin(time * 2);
    this.material.opacity = opened ? 0.46 + pulse * 0.035 : 0;
    this.light.intensity = opened ? 3 + pulse * 0.2 : 0;
    for (const panel of this.panels) panel.visible = opened;
  }
}
