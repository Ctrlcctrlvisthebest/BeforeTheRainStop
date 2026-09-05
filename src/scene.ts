import * as THREE from "three";
import {
  COLORS,
  LEVELS,
  platformAt,
  activeHazard,
  type Game,
  type Platform,
  type Point,
} from "./game";
const material = (color: string) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
function slab(b: Platform, color: string): THREE.Group {
  const group = new THREE.Group();
  const mats = [
    material(color),
    material(color),
    material("#fff5d9"),
    material(color),
    material(color),
    material(color),
  ];
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.y = -b.h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({
      color: "#3f6056",
      transparent: true,
      opacity: 0.18,
    }),
  );
  edge.position.y = -b.h / 2;
  group.add(edge);
  group.position.set(b.x, b.y, b.z);
  return group;
}
function facet(points: number[], color: string): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.computeVertexNormals();
  const m = material(color);
  m.side = THREE.DoubleSide;
  return new THREE.Mesh(g, m);
}
function paperBird(color: string): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.37),
    material(color),
  );
  body.scale.set(1, 0.7, 0.75);
  body.position.y = 0.38;
  group.add(body);
  for (const s of [-1, 1]) {
    const wing = facet(
      [
        -0.25,
        0.35,
        0,
        -0.58,
        0.73,
        s * 0.86,
        0.42,
        0.32,
        s * 0.47,
        -0.25,
        0.35,
        0,
        0.42,
        0.32,
        s * 0.47,
        0.26,
        0.26,
        0,
      ],
      color,
    );
    wing.name = `wing${s}`;
    group.add(wing);
  }
  group.add(
    facet(
      [
        0.2, 0.4, 0, 0.47, 0.96, 0, 0.61, 0.75, 0.07, 0.47, 0.96, 0, 0.84, 0.81,
        0, 0.61, 0.75, 0.07,
      ],
      color,
    ),
  );
  group.add(facet([-0.2, 0.32, 0, -0.86, 0.67, 0, -0.54, 0.18, 0.06], color));
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return group;
}
function textSprite(text: string, color = "#34544e", scale = 1): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.font = '500 32px "PingFang SC", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 320, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  sprite.scale.set(6.4 * scale, 0.96 * scale, 1);
  return sprite;
}
export class PaperScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private root = new THREE.Group();
  private camera = new THREE.OrthographicCamera();
  private birds: THREE.Group[] = [];
  private tiles: THREE.Group[] = [];
  private keys: THREE.Group[] = [];
  private stars: THREE.Mesh[] = [];
  private pads: THREE.Mesh[] = [];
  private checkpoints: THREE.Group[] = [];
  private hazards: THREE.Group[] = [];
  private gate: THREE.Group | null = null;
  private portal = new THREE.Group();
  private signs: THREE.Sprite[] = [];
  private windLines: THREE.Mesh[] = [];
  private resize: ResizeObserver;
  private level = -1;
  private count = 0;
  private yaw = 0;
  private target = new THREE.Vector3(4, 1, 0);
  private initialized = false;
  private width = 1000;
  private height = 600;
  private clock = 0;
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.add(
      this.root,
      new THREE.HemisphereLight("#fff9e8", "#77938c", 2.5),
    );
    const sun = new THREE.DirectionalLight("#ffefd6", 3);
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -35,
      right: 35,
      top: 30,
      bottom: -30,
      near: 0.1,
      far: 90,
    });
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
    this.resize = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      this.width = Math.max(width, 1);
      this.height = Math.max(height, 1);
      this.renderer.setSize(this.width, this.height, false);
    });
    this.resize.observe(canvas);
  }
  private build(g: Game) {
    this.root.traverse((o) => {
      if (
        o instanceof THREE.Mesh ||
        o instanceof THREE.LineSegments ||
        o instanceof THREE.Points
      ) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.root.clear();
    this.level = g.level;
    this.count = g.mode;
    this.birds = [];
    this.tiles = [];
    this.keys = [];
    this.stars = [];
    this.signs = [];
    this.pads = [];
    this.checkpoints = [];
    this.hazards = [];
    this.windLines = [];
    const l = LEVELS[g.level];
    this.scene.background = new THREE.Color(l.sky);
    this.scene.fog = new THREE.Fog(l.sky, 45, 95);
    l.platforms.forEach((b) => {
      const node = slab(
        b,
        b.kind === "wall"
          ? "#b39278"
          : b.kind === "moving"
            ? "#b08dcd"
            : l.color,
      );
      this.tiles.push(node);
      this.root.add(node);
    });
    if (l.gate) {
      this.gate = slab(l.gate, "#d49b57");
      this.root.add(this.gate);
    } else this.gate = null;
    l.keys.forEach((k) => {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.19, 0.065, 6, 12),
        material("#ffcd43"),
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 0.12;
      const stem = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.4, 0.08),
        material("#ffcd43"),
      );
      stem.position.y = -0.17;
      group.add(ring, stem);
      group.position.set(k.x, k.y, k.z);
      this.keys.push(group);
      this.root.add(group);
    });
    l.stars.forEach((k) => {
      const node = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.23),
        material("#f4ac63"),
      );
      node.position.set(k.x, k.y, k.z);
      this.root.add(node);
      this.stars.push(node);
    });
    l.signs.forEach((k) => {
      const sprite = textSprite(k.text ?? "");
      sprite.position.set(k.x, k.y + 2, k.z);
      this.signs.push(sprite);
      this.root.add(sprite);
    });
    l.pads.slice(0, Math.min(g.mode, l.pads.length)).forEach((k) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.58, 0.62, 0.12, 24),
        material("#d69b65"),
      );
      m.position.set(k.x, k.y + 0.065, k.z);
      this.pads.push(m);
      this.root.add(m);
    });
    l.checkpoints.forEach((k) => {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.5, 5),
        material("#668473"),
      );
      pole.position.y = 0.75;
      const flag = facet([0, 1.45, 0, 0.65, 1.32, 0, 0, 1.03, 0], "#f7c969");
      group.add(pole, flag);
      group.position.set(k.x, k.y, k.z + 0.8);
      this.checkpoints.push(group);
      this.root.add(group);
    });
    l.hazards.forEach((k) => {
      const group = new THREE.Group();
      for (let x = -k.w / 2 + 0.1; x < k.w / 2; x += 0.3) {
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 0.65, 4),
          material("#527780"),
        );
        spike.position.set(x, 0.3, 0);
        group.add(spike);
      }
      group.position.set(k.x, k.y, k.z);
      this.hazards.push(group);
      this.root.add(group);
    });
    l.winds.forEach((w) => {
      for (let i = 0; i < 16; i++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.38, 0.025),
          new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0.65,
          }),
        );
        line.userData.wind = w;
        line.userData.offset = i / 16;
        this.windLines.push(line);
        this.root.add(line);
      }
    });
    this.portal = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 2.6, 0.35),
        material("#53756a"),
      );
      post.position.set(s * 0.8, 1.3, 0);
      this.portal.add(post);
    }
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.25, 0.35),
      material("#53756a"),
    );
    top.position.y = 2.6;
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 2.5),
      new THREE.MeshBasicMaterial({
        color: "#f7d786",
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    );
    door.position.y = 1.3;
    door.name = "glow";
    const doorText = textSprite("一起到家", "#6c846b", 0.65);
    doorText.position.y = 3.15;
    this.portal.add(top, door, doorText);
    this.portal.position.set(l.exit.x, l.exit.y, l.exit.z);
    this.root.add(this.portal);
    for (const p of g.players) {
      const group = new THREE.Group();
      const bird = paperBird(COLORS[p.id]);
      bird.name = "bird";
      const bridge = slab(
        { x: 0, y: 0.24, z: 0, w: 3.2, h: 0.09, d: 0.9 },
        COLORS[p.id],
      );
      bridge.name = "bridge";
      bridge.visible = false;
      const label = textSprite(`${p.id + 1}`, COLORS[p.id], 0.4);
      label.position.y = 1.6;
      label.name = "label";
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 20),
        new THREE.MeshBasicMaterial({
          color: "#284d43",
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.015;
      group.add(bird, bridge, label, shadow);
      group.position.set(p.x, p.y, p.z);
      this.root.add(group);
      this.birds.push(group);
    }
    // Paper motes make depth readable while the camera turns.
    const dots: number[] = [];
    for (let i = 0; i < 90; i++)
      dots.push(
        ((i * 7.91) % 54) - 8,
        ((i * 1.73) % 12) - 2,
        (-(i * 3.27) % 27) + 5,
      );
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
    this.root.add(
      new THREE.Points(
        dg,
        new THREE.PointsMaterial({
          color: "#ffffff",
          size: 0.055,
          transparent: true,
          opacity: 0.6,
        }),
      ),
    );
    this.initialized = false;
  }
  render(g: Game, local: number, dt: number) {
    if (g.level !== this.level || g.mode !== this.count) this.build(g);
    this.clock += dt;
    const l = LEVELS[g.level];
    const player = g.players[local] ?? g.players[0];
    const yawTarget = (g.view * Math.PI) / 2;
    this.yaw += (yawTarget - this.yaw) * Math.min(1, dt * 12);
    const goal = new THREE.Vector3(
      player.x + (g.view === 0 ? 4 : 0),
      Math.max(1.3, player.y + 1.3),
      player.z - (g.view === 1 ? 4 : 0),
    );
    if (!this.initialized) {
      this.target.copy(goal);
      this.yaw = yawTarget;
      this.initialized = true;
    }
    this.target.lerp(goal, 1 - Math.exp(-dt * 6));
    const aspect = this.width / this.height;
    const viewHeight = aspect > 1.5 ? 12.5 : 17;
    const viewWidth = Math.max(19, viewHeight * aspect);
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewWidth / aspect / 2;
    this.camera.bottom = -viewWidth / aspect / 2;
    this.camera.near = 0.1;
    this.camera.far = 140;
    this.camera.position
      .copy(this.target)
      .add(
        new THREE.Vector3(
          Math.sin(this.yaw) * 32,
          7.5,
          Math.cos(this.yaw) * 32,
        ),
      );
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.tiles.forEach((node, i) => {
      const b = platformAt(l.platforms[i], g.motionTime);
      node.position.set(b.x, b.y, b.z);
      const distance =
        g.view === 0 ? Math.abs(b.z - player.z) : Math.abs(b.x - player.x);
      const depth = g.view === 0 ? b.d : b.w;
      const ghost = distance > depth / 2 + 0.45;
      node.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            m.transparent = ghost;
            m.opacity = ghost ? 0.24 : 1;
            m.depthWrite = !ghost;
          });
        }
      });
    });
    this.birds.forEach((node, i) => {
      const p = g.players[i];
      const target = new THREE.Vector3(p.x, p.y, p.z);
      if (node.position.distanceTo(target) > 3) node.position.copy(target);
      else
        node.position.lerp(target, 1 - Math.exp(-dt * (i === local ? 32 : 17)));
      node.visible = !p.arrived || g.status === "won";
      const bird = node.getObjectByName("bird")!;
      const bridge = node.getObjectByName("bridge")!;
      bird.visible = !p.folded;
      bridge.visible = p.folded;
      bird.rotation.y = (g.view * Math.PI) / 2 + (p.facing < 0 ? Math.PI : 0);
      bridge.rotation.y = (g.view * Math.PI) / 2;
      bird.position.y = p.grounded ? Math.sin(this.clock * 7 + i) * 0.025 : 0;
      for (const s of [-1, 1]) {
        const wing = bird.getObjectByName(`wing${s}`)!;
        wing.rotation.x = p.grounded
          ? Math.sin(this.clock * 3 + i) * 0.06
          : Math.sin(this.clock * (p.vy < 0 ? 5 : 14)) * s * 0.16;
      }
      const label = node.getObjectByName("label") as THREE.Sprite;
      label.material.opacity = i === local ? 1 : 0.55;
      label.scale.set(i === local ? 3.2 : 2.56, i === local ? 0.48 : 0.384, 1);
      node.traverse((o) => {
        if (o instanceof THREE.Mesh && o.name !== "glow" && p.invulnerable > 0)
          o.visible = Math.sin(this.clock * 16) > -0.5;
        else if (o instanceof THREE.Mesh) o.visible = true;
      });
    });
    this.keys.forEach((o, i) => {
      o.visible = !g.keys.includes(i);
      o.rotation.y = this.clock * 1.5;
      o.position.y = l.keys[i].y + Math.sin(this.clock * 3 + i) * 0.12;
    });
    this.stars.forEach((o, i) => {
      o.visible = !g.stars.includes(i);
      o.rotation.y = this.clock;
      o.position.y = l.stars[i].y + Math.sin(this.clock * 2 + i) * 0.14;
    });
    this.pads.forEach((m, i) => {
      const pad = l.pads[i];
      const on =
        g.gateOpen ||
        g.players.some(
          (p) =>
            Math.hypot(p.x - pad.x, p.z - pad.z) < 0.75 &&
            Math.abs(p.y - pad.y) < 0.4,
        );
      (m.material as THREE.MeshStandardMaterial).color.set(
        on ? "#80bf8c" : "#d69b65",
      );
      m.scale.y = on ? 0.35 : 1;
    });
    if (this.gate) this.gate.visible = !g.gateOpen;
    this.hazards.forEach((o, i) => {
      o.scale.y = activeHazard(l.hazards[i].period, g.time) ? 1 : 0.1;
    });
    this.signs.forEach((o, i) => {
      const sign = l.signs[i];
      o.visible =
        (sign.view === undefined || sign.view === g.view) &&
        Math.hypot(sign.x - player.x, sign.z - player.z) < 8;
    });
    this.windLines.forEach((o, i) => {
      const w = o.userData.wind as Point & {
        w: number;
        d: number;
        height: number;
      };
      const offset = o.userData.offset as number;
      o.position.set(
        w.x + Math.sin(i * 4) * w.w * 0.35,
        w.y + ((this.clock * 0.65 + offset) % 1) * w.height,
        w.z + Math.cos(i * 9) * w.d * 0.35,
      );
    });
    const glow = this.portal.getObjectByName("glow") as THREE.Mesh;
    const pm = glow.material as THREE.MeshBasicMaterial;
    const opened = g.keys.length === l.keys.length && (!l.gate || g.gateOpen);
    pm.opacity = opened ? 0.52 + Math.sin(this.clock * 2) * 0.12 : 0.12;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.resize.disconnect();
    this.root.traverse((o) => {
      if (
        o instanceof THREE.Mesh ||
        o instanceof THREE.LineSegments ||
        o instanceof THREE.Points
      ) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.renderer.dispose();
  }
}
