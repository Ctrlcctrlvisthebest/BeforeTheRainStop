import * as THREE from "three";
import type { MechanismFeedback } from "./mechanism-state";

const WIDTH = 640;
const HEIGHT = 224;
const INK = "#463c32";
const OCHRE = "#a46c3e";

/** A folded paper slip for live interactions. Text changes at tenths of a
 * second; the ink stroke grows without uploading a texture every frame. */
export class MechanismCard extends THREE.Group {
  private context: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private fill: THREE.Mesh;
  private lastText = "";
  constructor() {
    super();
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    this.context = canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1, HEIGHT / WIDTH),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    face.renderOrder = 20;
    // Uneven ends and edges make the progress feel like a brush mark on paper.
    const stroke = new THREE.Shape();
    stroke.moveTo(0, -4 / WIDTH);
    stroke.lineTo(4 / WIDTH, 5 / WIDTH);
    stroke.lineTo(226 / WIDTH, 4 / WIDTH);
    stroke.lineTo(546 / WIDTH, 6 / WIDTH);
    stroke.lineTo(552 / WIDTH, 1 / WIDTH);
    stroke.lineTo(548 / WIDTH, -5 / WIDTH);
    stroke.lineTo(318 / WIDTH, -4 / WIDTH);
    stroke.lineTo(6 / WIDTH, -6 / WIDTH);
    stroke.closePath();
    this.fill = new THREE.Mesh(
      new THREE.ShapeGeometry(stroke),
      new THREE.MeshBasicMaterial({
        color: OCHRE,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.fill.position.set(44 / WIDTH - 0.5, (HEIGHT / 2 - 177) / WIDTH, 0.001);
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
    this.scale.setScalar((compact ? 188 : 208) * worldPerPixel);
    const progress = Math.max(0, Math.min(1, item.progress));
    this.fill.scale.x = progress;
    this.fill.visible = progress > 0;
    const text = `${item.title}\n${item.detail}`;
    if (text === this.lastText) return;
    this.lastText = text;
    const ctx = this.context;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const paper = () => {
      ctx.beginPath();
      ctx.moveTo(14, 14);
      ctx.lineTo(591, 10);
      ctx.lineTo(626, 43);
      ctx.lineTo(623, 209);
      ctx.lineTo(444, 211);
      ctx.lineTo(257, 207);
      ctx.lineTo(12, 212);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(3, 5);
    paper();
    ctx.fillStyle = "#17222a55";
    ctx.fill();
    ctx.restore();
    paper();
    ctx.fillStyle = "#dfd3b9";
    ctx.fill();
    // Quiet paper fibres; fixed positions keep the slip still as time changes.
    ctx.fillStyle = "#74664c12";
    for (let i = 0; i < 65; i++) {
      const x = 25 + ((i * 83) % 574);
      const y = 24 + ((i * 47) % 172);
      ctx.fillRect(x, y, 2 + (i % 5), 1);
    }
    ctx.beginPath();
    ctx.moveTo(591, 10);
    ctx.lineTo(589, 45);
    ctx.lineTo(626, 43);
    ctx.closePath();
    ctx.fillStyle = "#b7a78a";
    ctx.fill();
    // A small folded-paper mark replaces the luminous HUD frame.
    ctx.strokeStyle = OCHRE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(39, 51);
    ctx.lineTo(69, 43);
    ctx.lineTo(62, 77);
    ctx.lineTo(49, 64);
    ctx.closePath();
    ctx.moveTo(49, 64);
    ctx.lineTo(69, 43);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = '600 44px "Songti SC", "Noto Serif CJK SC", serif';
    ctx.fillText(item.title, 91, 80, 497);
    ctx.fillStyle = "#625646";
    ctx.font = '36px "PingFang SC", system-ui, sans-serif';
    ctx.fillText(item.detail, 42, 136, 552);
    ctx.beginPath();
    ctx.moveTo(44, 174);
    ctx.lineTo(322, 173);
    ctx.lineTo(594, 174);
    ctx.lineTo(596, 181);
    ctx.lineTo(330, 180);
    ctx.lineTo(46, 182);
    ctx.closePath();
    ctx.fillStyle = "#b6a688";
    ctx.fill();
    this.texture.needsUpdate = true;
  }
}
