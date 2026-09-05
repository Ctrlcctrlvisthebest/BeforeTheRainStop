import { translate, type Language } from "./i18n";
import { WEATHER, rainStrength, SHIELD_RADIUS } from "./weather";
import * as THREE from "three";
import {
  COLORS,
  MAX_FOLDS,
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
    material("#8c98a3"),
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
      color: "#243442",
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
    wing.geometry.translate(0, -0.35, 0);
    wing.position.y = 0.35;
    wing.scale.z = 1.28;
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
function textSprite(text: string, color = "#d6d9dc", scale = 1): THREE.Sprite {
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
function box(
  w: number,
  h: number,
  d: number,
  color: string,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function wishingRack(w: number, height: number, seed = 0): THREE.Group {
  const rack = new THREE.Group();
  for (const side of [-1, 1]) {
    rack.add(
      box(0.1, height, 0.13, "#443b37", side * (w / 2 - 0.08), height / 2),
    );
    const eave = box(
      w / 2 + 0.22,
      0.12,
      0.9,
      "#3a4149",
      (side * w) / 4,
      height + 0.13,
      0,
    );
    eave.rotation.z = -side * 0.17;
    rack.add(eave);
  }
  for (const y of [height - 0.25, height * 0.52])
    rack.add(box(w, 0.065, 0.1, "#685446", 0, y, 0));
  const count = Math.max(3, Math.floor(w / 0.45));
  for (let i = 0; i < count; i++) {
    const tag = new THREE.Group();
    tag.name = "wish-tag";
    tag.userData.phase = seed + i * 1.72;
    tag.position.set(
      -w / 2 + 0.23 + ((w - 0.46) * i) / Math.max(1, count - 1),
      height - 0.28,
      0.06,
    );
    const cord = box(0.012, 0.2, 0.012, "#ac6754", 0, -0.1, 0);
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, -0.3);
    shape.lineTo(0.15, -0.3);
    shape.lineTo(0.15, -0.06);
    shape.lineTo(0, 0.03);
    shape.lineTo(-0.15, -0.06);
    shape.closePath();
    const plaque = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      material(i % 3 ? "#ac8860" : "#c2aa84"),
    );
    (plaque.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    plaque.position.y = -0.22;
    tag.add(cord, plaque);
    for (let j = 0; j < 3; j++)
      tag.add(
        box(
          0.09 - (j % 2) * 0.025,
          0.007,
          0.007,
          "#665246",
          0,
          -0.33 - j * 0.045,
          0.007,
        ),
      );
    rack.add(tag);
    if (i % 2 === 0) {
      const paper = box(
        0.07,
        0.38,
        0.015,
        "#d1cabc",
        tag.position.x,
        height * 0.52 - 0.23,
        0.03,
      );
      paper.rotation.z = 0.1 * ((i % 3) - 1);
      rack.add(paper);
    }
  }
  return rack;
}
function unfoldedPaper(color: string): THREE.Group {
  const sheet = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(8 * 9), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const uv: number[] = [];
  const edge = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  for (let i = 0; i < 8; i++) {
    const a = edge[i],
      b = edge[(i + 1) % 8];
    uv.push(
      0.5,
      0.5,
      (a[0] + 1) / 2,
      (a[1] + 1) / 2,
      (b[0] + 1) / 2,
      (b[1] + 1) / 2,
    );
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#eee3cb";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.23;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff14" : "#594c3914";
    ctx.fillRect((i * 73.37) % 512, (i * 37.91) % 512, 1, 1);
  }
  ctx.strokeStyle = "#6c5c4945";
  ctx.lineWidth = 1.2;
  for (const line of [
    [0, 0, 512, 512],
    [512, 0, 0, 512],
    [256, 0, 256, 512],
    [0, 256, 512, 256],
  ]) {
    ctx.beginPath();
    ctx.moveTo(line[0], line[1]);
    ctx.lineTo(line[2], line[3]);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(447, 446, 35, 35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(452, 475);
  ctx.lineTo(463, 454);
  ctx.lineTo(478, 475);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = material("#ffffff");
  mat.map = texture;
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = "paper-surface";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  sheet.add(mesh);
  const creaseGeo = new THREE.BufferGeometry();
  creaseGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(8 * 6), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const creases = new THREE.LineSegments(
    creaseGeo,
    new THREE.LineBasicMaterial({
      color: "#69503d",
      transparent: true,
      opacity: 0.25,
    }),
  );
  creases.name = "paper-creases";
  creases.frustumCulled = false;
  sheet.add(creases);
  return sheet;
}
function shapePaper(
  sheet: THREE.Object3D,
  progress: number,
  foldsLeft: number,
  wetness: number,
  time: number,
  bridge: boolean,
) {
  const mesh = sheet.getObjectByName("paper-surface") as THREE.Mesh;
  const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const wear = 1 - foldsLeft / MAX_FOLDS;
  const half = bridge ? 1.6 : SHIELD_RADIUS;
  const depth = bridge ? 0.45 : SHIELD_RADIUS;
  const edges = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const center = 0.4 + (bridge ? -0.16 : 0.91) * progress;
  const vertices = edges.map(([x, z], i) => {
    const nick = i % 2 ? wear * 0.28 : wear * 0.015;
    return new THREE.Vector3(
      x * (half - nick) * progress,
      z === 0
        ? center + 0.025
        : center +
            Math.abs(z) * (0.68 * (1 - progress)) +
            Math.sin(time * 2 + i) * 0.025 * progress * (bridge ? 0.15 : 1),
      z * (depth - nick) * progress,
    );
  });
  for (let i = 0; i < 8; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % 8];
    pos.setXYZ(i * 3, 0, center + 0.035 * progress, 0);
    pos.setXYZ(i * 3 + 1, a.x, a.y, a.z);
    pos.setXYZ(i * 3 + 2, b.x, b.y, b.z);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  (mesh.material as THREE.MeshStandardMaterial).color
    .set("#ffffff")
    .lerp(new THREE.Color("#8596a5"), wetness / 150);
  const lines = sheet.getObjectByName("paper-creases") as THREE.LineSegments;
  const lp = lines.geometry.getAttribute("position") as THREE.BufferAttribute;
  vertices.forEach((v, i) => {
    lp.setXYZ(i * 2, 0, center + 0.048, 0);
    lp.setXYZ(i * 2 + 1, v.x, v.y + 0.012, v.z);
  });
  lp.needsUpdate = true;
  (lines.material as THREE.LineBasicMaterial).opacity = 0.12 + wear * 0.65;
}

export class PaperScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private root = new THREE.Group();
  private camera = new THREE.OrthographicCamera();
  private birds: THREE.Group[] = [];
  private rain: THREE.LineSegments | null = null;
  private rainSeeds: { x: number; z: number; phase: number; speed: number }[] =
    [];
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
  private language: Language = "zh";
  private wishes: THREE.Object3D[] = [];
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
    this.renderer.toneMappingExposure = 0.95;
    this.scene.add(
      this.root,
      new THREE.HemisphereLight("#a7bfda", "#202c3c", 2.3),
    );
    const sun = new THREE.DirectionalLight("#c4d6eb", 2.2);
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
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
          m.dispose();
        });
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
    this.scene.fog = new THREE.Fog(l.sky, 32, 95);
    l.platforms.forEach((b) => {
      const node = slab(
        b,
        b.kind === "wall"
          ? "#594d47"
          : b.kind === "moving"
            ? "#778098"
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
      const sprite = textSprite(translate(this.language, k.text ?? ""));
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
    [l.spawn, ...l.checkpoints].forEach((k) => {
      const group = wishingRack(1.55, 1.75);
      group.position.set(k.x, k.y, k.z - 1.05);
      const title = textSprite(
        translate(this.language, "许愿架 · F 修补"),
        "#e5bd81",
        0.55,
      );
      title.position.set(k.x, k.y + 2.25, k.z - 1.05);
      title.name = "awning-label";
      this.root.add(group, title);
      this.checkpoints.push(group);
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
        material("#705245"),
      );
      post.position.set(s * 0.8, 1.3, 0);
      this.portal.add(post);
    }
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.25, 0.35),
      material("#705245"),
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
    const doorText = textSprite(
      translate(this.language, "一起到家"),
      "#e7c183",
      0.65,
    );
    doorText.position.y = 3.15;
    this.portal.add(top, door, doorText);
    this.portal.position.set(l.exit.x, l.exit.y, l.exit.z);
    this.root.add(this.portal);
    for (const p of g.players) {
      const group = new THREE.Group();
      const bird = paperBird(COLORS[p.id]);
      bird.name = "bird";
      const bridge = unfoldedPaper(COLORS[p.id]);
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
      const shelter = unfoldedPaper(COLORS[p.id]);
      shelter.name = "shelter";
      group.userData.unfold = 0;
      group.userData.shape = "shelter";
      const wet = new THREE.Group();
      wet.name = "wet-meter";
      wet.position.set(0, 1.24, 0);
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.06),
        new THREE.MeshBasicMaterial({
          color: "#fff6df",
          depthTest: false,
          transparent: true,
          opacity: 0.7,
        }),
      );
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.06),
        new THREE.MeshBasicMaterial({ color: "#627f8c", depthTest: false }),
      );
      fill.name = "fill";
      fill.position.z = 0.001;
      wet.add(back, fill);
      group.add(bird, bridge, label, shadow, shelter, wet);
      group.position.set(p.x, p.y, p.z);
      this.root.add(group);
      this.birds.push(group);
    }
    // Roofed wishing racks, cords and wooden plaques frame the dry stops.
    WEATHER[g.level].awnings.forEach((a, index) => {
      const rack = wishingRack(a.w, 3.4, index);
      rack.position.set(a.x, a.y - 3.4, a.z - a.d / 2 + 0.12);
      this.root.add(rack);
      for (const side of [-1, 1]) {
        const roof = box(
          a.w + 0.3,
          0.13,
          a.d / 2 + 0.18,
          "#414b58",
          a.x,
          a.y + 0.14,
          a.z + (side * a.d) / 4,
        );
        roof.rotation.x = side * 0.085;
        this.root.add(roof);
      }
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 8),
        material("#e6ac6b"),
      );
      lantern.scale.set(0.8, 1.35, 0.8);
      lantern.position.set(a.x + a.w / 2 - 0.3, a.y - 0.4, a.z + 0.8);
      (lantern.material as THREE.MeshStandardMaterial).emissive.set("#e6a354");
      (lantern.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
      this.root.add(lantern);
      const title = textSprite(
        translate(this.language, "檐下晾干"),
        "#bcc9d7",
        0.5,
      );
      title.name = "awning-label";
      title.position.set(a.x, a.y + 0.5, a.z);
      this.root.add(title);
    });
    // A distant shrine courtyard remains behind the playable route in both views.
    for (let i = 0; i < 5; i++) {
      const rack = wishingRack(5.8, 3.6, i * 7);
      rack.position.set(-7 + i * 10, -1.1, -20 - (i % 2) * 3);
      this.root.add(rack);
    }
    const temple = new THREE.Group();
    temple.add(box(27, 3, 5, "#28313e", 0, 1.5, 0));
    for (const side of [-1, 1]) {
      const roof = box(30, 0.4, 4.5, "#202c3a", 0, 3.9, side * 1.8);
      roof.rotation.x = side * 0.22;
      temple.add(roof);
    }
    for (let x = -12; x <= 12; x += 2.6) {
      temple.add(box(0.2, 3.6, 0.22, "#403d3e", x, 1.8, 2.6));
      temple.add(box(0.7, 1.3, 0.06, "#816b52", x, 1.8, 2.53));
    }
    temple.position.set(11, 0, -29);
    this.root.add(temple);
    this.wishes = [];
    this.root.traverse((o) => {
      if (o.name === "wish-tag") this.wishes.push(o);
    });
    this.rainSeeds = [];
    WEATHER[g.level].zones.forEach((zone, zi) => {
      for (let i = 0; i < 160; i++)
        this.rainSeeds.push({
          x: zone.x + (((i * 0.618033 + zi * 0.37) % 1) - 0.5) * zone.w,
          z: zone.z + (((i * 0.414213 + zi * 0.19) % 1) - 0.5) * zone.d,
          phase: (i * 0.754877) % 1,
          speed: 1 + (i % 7) * 0.08,
        });
    });
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(this.rainSeeds.length * 6),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    this.rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: "#a4b9d0",
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.root.add(this.rain);
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
  render(
    g: Game,
    local: number,
    dt: number,
    preview = false,
    language: Language = "zh",
  ) {
    if (
      g.level !== this.level ||
      g.mode !== this.count ||
      language !== this.language
    ) {
      this.language = language;
      this.build(g);
    }
    this.clock += dt;
    this.wishes.forEach((o) => {
      o.rotation.z = Math.sin(this.clock * 1.25 + o.userData.phase) * 0.055;
      o.rotation.x = Math.sin(this.clock * 0.9 + o.userData.phase) * 0.045;
    });
    this.root.children.forEach((o) => {
      if (o.name === "awning-label") o.visible = !preview;
    });
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
      const shelter = node.getObjectByName("shelter")!;
      const opening = p.sheltering || p.folded;
      if (opening) node.userData.shape = p.folded ? "bridge" : "shelter";
      const targetUnfold = opening ? 1 : 0;
      node.userData.unfold = THREE.MathUtils.damp(
        node.userData.unfold,
        targetUnfold,
        11,
        dt,
      );
      const unfold = node.userData.unfold as number;
      shelter.visible = unfold > 0.01 && node.userData.shape === "shelter";
      bridge.visible = unfold > 0.01 && node.userData.shape === "bridge";
      bird.visible = unfold < 0.93;
      bird.scale.setScalar(Math.max(0.01, 1 - unfold));
      shapePaper(
        shelter,
        unfold,
        p.foldsLeft ?? MAX_FOLDS,
        p.wetness ?? 0,
        this.clock,
        false,
      );
      shapePaper(
        bridge,
        unfold,
        p.foldsLeft ?? MAX_FOLDS,
        p.wetness ?? 0,
        this.clock,
        true,
      );
      bird.rotation.y = (g.view * Math.PI) / 2 + (p.facing < 0 ? Math.PI : 0);
      bridge.rotation.y = (g.view * Math.PI) / 2;
      bird.position.y = p.grounded ? Math.sin(this.clock * 7 + i) * 0.025 : 0;
      for (const s of [-1, 1]) {
        const wing = bird.getObjectByName(`wing${s}`)!;
        const amplitude = p.grounded ? 0.38 : p.vy < 0 ? 0.5 : 0.9;
        wing.rotation.x = p.sheltering
          ? s * 0.08
          : Math.sin(this.clock * (p.grounded ? 5 : p.vy < 0 ? 7 : 11) + i) *
            s *
            amplitude;
        wing.scale.z = p.sheltering ? 1.7 : 1.28;
      }
      bird.traverse((o) => {
        if (
          o instanceof THREE.Mesh &&
          o.material instanceof THREE.MeshStandardMaterial
        )
          o.material.color
            .set(COLORS[p.id])
            .lerp(new THREE.Color("#586f82"), (p.wetness ?? 0) / 160);
      });
      const meter = node.getObjectByName("wet-meter")!;
      meter.visible = (p.wetness ?? 0) > 1;
      meter.rotation.copy(this.camera.rotation);
      meter.position.y = p.sheltering ? 2.0 : 1.24;
      const fill = meter.getObjectByName("fill") as THREE.Mesh;
      fill.scale.x = Math.max(0.01, (p.wetness ?? 0) / 100);
      fill.position.x = -0.4 * (1 - fill.scale.x);
      (fill.material as THREE.MeshBasicMaterial).color.set(
        (p.wetness ?? 0) > 70 ? "#b44f40" : "#627f8c",
      );
      const label = node.getObjectByName("label") as THREE.Sprite;
      label.position.y = p.sheltering ? 2.4 : 1.6;
      label.visible = !preview;
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
        on ? "#f1d69a" : "#8b7564",
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
        !preview &&
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
    if (this.rain) {
      const pos = this.rain.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      const time = g.status === "playing" ? this.clock : g.motionTime;
      this.rainSeeds.forEach((seed, i) => {
        let bottom = -2.5;
        for (const a of WEATHER[g.level].awnings)
          if (
            Math.abs(seed.x - a.x) < a.w / 2 &&
            Math.abs(seed.z - a.z) < a.d / 2
          )
            bottom = Math.max(bottom, a.y + 0.05);
        for (const p of g.players)
          if (
            p.sheltering &&
            Math.abs(seed.x - p.x) < SHIELD_RADIUS &&
            Math.abs(seed.z - p.z) < SHIELD_RADIUS
          )
            bottom = Math.max(bottom, p.y + 1.34);
        for (const raw of l.platforms) {
          const p = platformAt(raw, g.motionTime);
          if (
            Math.abs(seed.x - p.x) < p.w / 2 &&
            Math.abs(seed.z - p.z) < p.d / 2
          )
            bottom = Math.max(bottom, p.y + 0.02);
        }
        const y =
          bottom +
          (1 - ((time * 0.7 * seed.speed + seed.phase) % 1)) * (12 - bottom);
        pos.setXYZ(i * 2, seed.x, y, seed.z);
        pos.setXYZ(
          i * 2 + 1,
          seed.x + 0.045,
          Math.max(bottom, y - 0.3 * seed.speed),
          seed.z,
        );
      });
      pos.needsUpdate = true;
      (this.rain.material as THREE.LineBasicMaterial).opacity =
        rainStrength(g.level, g.motionTime) > 1 ? 0.53 : 0.3;
    }
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
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
          m.dispose();
        });
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.renderer.dispose();
  }
}
