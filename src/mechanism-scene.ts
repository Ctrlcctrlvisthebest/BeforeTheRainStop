import * as THREE from "three";
import type { MechanismFeedback } from "./mechanism-state";

/** A compact billboard: only live interactions allocate a card. Textures update
 * at tenths of a second; fill width is geometry, not a texture upload per frame. */
export class MechanismCard extends THREE.Group {
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private fill: THREE.Mesh;
  private lastText = "";
  constructor() {
    super();
    this.canvas.width = 512;
    this.canvas.height = 164;
    this.context = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 164 / 512),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    face.renderOrder = 20;
    this.fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.014),
      new THREE.MeshBasicMaterial({
        color: "#89e0d6",
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.fill.position.set(-0.45, -0.11, 0.001);
    this.fill.geometry.translate(0.45, 0, 0);
    this.fill.renderOrder = 21;
    this.add(face, this.fill);
  }
  update(
    item: MechanismFeedback,
    camera: THREE.Camera,
    worldPerPixel: number,
    compact: boolean,
  ) {
    this.visible = true;
    this.position.set(item.anchor.x, item.anchor.y + 2.3, item.anchor.z);
    this.quaternion.copy(camera.quaternion);
    this.scale.setScalar((compact ? 154 : 176) * worldPerPixel);
    this.fill.scale.x = Math.max(0, Math.min(1, item.progress));
    const text = `${item.title}\n${item.detail}`;
    if (text === this.lastText) return;
    this.lastText = text;
    const ctx = this.context;
    ctx.clearRect(0, 0, 512, 164);
    ctx.fillStyle = "#192c3df2";
    ctx.fillRect(0, 0, 512, 164);
    ctx.strokeStyle = "#8dcfc4";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 509, 161);
    ctx.fillStyle = "#f3e4c7";
    ctx.font = '600 37px "PingFang SC", system-ui, sans-serif';
    ctx.fillText(item.title, 24, 52, 464);
    ctx.fillStyle = "#b9ccd6";
    ctx.font = '30px "PingFang SC", system-ui, sans-serif';
    ctx.fillText(item.detail, 24, 100, 464);
    ctx.fillStyle = "#435566";
    ctx.fillRect(26, 134, 460, 7);
    this.texture.needsUpdate = true;
  }
}
