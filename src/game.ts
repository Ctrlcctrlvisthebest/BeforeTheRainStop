import { CAMPAIGN_VERSION } from "./campaign-version";
import { EXTRA_LEVELS } from "./chapters";
import { CHALLENGE_MAPS } from "./challenge-maps";
import {
  initializeCollectibles,
  collect,
  bankCollectibles,
  dropCollectibles,
} from "./collectibles";
import {
  CROSSINGS,
  bankPoint,
  bridgePlank,
  dockBank,
  isOnBridgePlate,
} from "./bridges";
import {
  rainfall,
  underAwning,
  SHIELD_RADIUS,
  besideCampfire,
  FIRE_DRY_RATE,
  FIRE_HEAT_RATE,
  FIRE_COOL_RATE,
  BLAZE_HEIGHT,
  BLAZE_ROOFS,
  blazeRoofsFor,
} from "./weather";
export const MAX_FOLDS = 6;
export const REPAIR_SECONDS = 2;
export const MODES = [1, 2, 3, 6] as const;
export type Mode = (typeof MODES)[number];
export const COLORS = [
  "#f27461",
  "#55bace",
  "#eec65e",
  "#aa8ce5",
  "#76bd90",
  "#e98fbd",
];
export const NAMES = ["朱砂", "青岚", "麦穗", "紫藤", "松叶", "山樱"];
export interface Point {
  x: number;
  y: number;
  z: number;
}
export interface Platform extends Point {
  w: number;
  d: number;
  h: number;
  kind?: "wall" | "step" | "moving" | "low-roof" | "railing";
  motion?: { axis: "x" | "z"; range: number; period: number };
}
export interface Marker extends Point {
  text?: string;
  view?: 0 | 1;
}
export interface Level {
  name: string;
  sub: string;
  hint: string;
  color: string;
  sky: string;
  platforms: Platform[];
  spawn: Point;
  exit: Point;
  keys: Point[];
  stars: Point[];
  checkpoints: Marker[];
  signs: Marker[];
  pads: Point[];
  gate?: Platform;
  winds: (Point & { w: number; d: number; height: number })[];
  hazards: (Point & { w: number; d: number; period?: number })[];
}
const p = (x: number, z: number, w: number, d = 3, y = 0, h = 1): Platform => ({
  x,
  y,
  z,
  w,
  d,
  h,
});
export const LEVELS: Level[] = [
  {
    name: "纸的另一面",
    sub: "跑起来，世界还有另一面。",
    hint: "← → / A D 移动 · 空格跳跃，按住滑翔 · Q 转动世界",
    color: "#526577",
    sky: "#2c3b4b",
    spawn: { x: -1, y: 0, z: 0 },
    exit: { x: 29, y: 0, z: -7 },
    platforms: [
      p(1, 0, 7, 3, 0, 1),
      p(10, 0, 7, 3, 0, 1),
      p(11, -5.6, 3, 4.8, 0, 1),
      p(12.6, -7, 0.2, 3, 0, 1),
      p(28, -7, 7, 3, 0, 1),
      { ...p(12.3, 0, 0.55, 3, 4.2, 4.2), kind: "wall" },
      p(11, -1.0, 3, 2.0, 0, 1),
      p(17.8, -7, 7.4, 3, 0, 1),
    ],
    keys: [{ x: 16, y: 0.7, z: -7 }],
    stars: [
      { x: 5.5, y: 1.9, z: 0 },
      { x: 11, y: 1.6, z: -4 },
      { x: 23, y: 1.9, z: -7 },
    ],
    checkpoints: [
      { x: 10, y: 0, z: 0 },
      { x: 16, y: 0, z: -7 },
    ],
    signs: [
      { x: 2, y: 0, z: 0, text: "空格 跳过断口" },
      { x: 10, y: 0.8, z: 0, text: "Q 转到侧面 →", view: 0 },
      { x: 11, y: 0.6, z: -6.5, text: "Q 回到正面 →", view: 1 },
      { x: 20, y: 0.4, z: -7, text: "雨中按住 S · 替同伴挡雨" },
    ],
    pads: [],
    winds: [],
    hazards: [],
  },
  {
    name: "借你一片翅膀",
    sub: "有人搭桥，有人先走。",
    hint: "低檐断口跳不过 · Shift 搭纸桥 · 同伴到对岸接通木桥",
    color: "#596775",
    sky: "#303d4c",
    spawn: { x: -1, y: 0, z: 0 },
    exit: { x: 29, y: 0, z: -7 },
    platforms: [
      p(0.7, 0, 6.4, 3, 0, 1),
      p(10, 0, 7, 3, 0, 1),
      p(11, -5.6, 3, 4.8, 0, 1),
      p(12.6, -7, 0.2, 3, 0, 1),
      p(28, -7, 7, 3, 0, 1),
      p(9, 0, 1.2, 2, 1, 1),
      p(11.3, 0, 1.6, 2, 2.4, 0.4),
      { ...p(12.5, 0, 0.5, 3, 4, 4), kind: "wall" },
      { ...p(3.1, 0, 8.8, 3.4, 12, 10.99), kind: "low-roof" },
      { ...p(3.1, -1.7, 8.8, 0.2, 12, 12), kind: "railing" },
      { ...p(3.1, 1.7, 8.8, 0.2, 12, 12), kind: "railing" },
      p(11, -1.0, 3, 2.0, 0, 1),
      p(17.8, -7, 7.4, 3, 0, 1),
    ],
    keys: [{ x: 11.3, y: 3, z: 0 }],
    stars: [
      { x: 5.2, y: 0.55, z: 0 },
      { x: 11, y: 1, z: -4 },
      { x: 23, y: 2, z: -7 },
    ],
    checkpoints: [
      { x: 8, y: 0, z: 0 },
      { x: 17, y: 0, z: -7 },
    ],
    signs: [
      { x: 3.4, y: -0.8, z: 0, text: "桥钉旁按住 Shift · 搭桥让同伴过" },
      { x: 8, y: 0.2, z: 0, text: "踩台阶 / 叠高拿钥匙" },
      { x: 11, y: 0.4, z: -6.5, text: "Q 回到正面" },
      { x: 18, y: 0.5, z: -7, text: "踩住 4 秒 · S 展纸挡雨" },
    ],
    pads: [
      { x: 16, y: 0, z: -7 },
      { x: 19, y: 0, z: -7 },
    ],
    gate: { ...p(20.5, -7, 0.45, 3, 3.8, 3.8), kind: "wall" },
    winds: [],
    hazards: [],
  },
  {
    name: "乘同一阵风",
    sub: "风会带你去高一点的地方。",
    hint: "进入风柱会上升 · 跳上移动纸台 · 侧面藏着下一条路",
    color: "#59647d",
    sky: "#313d51",
    spawn: { x: -1, y: 0, z: 0 },
    exit: { x: 29, y: 1.2, z: -7 },
    platforms: [
      p(1, 0, 7, 3, 0, 1),
      p(10, 0, 7, 3, 0, 1),
      p(11, -5.6, 3, 4.8, 0, 1),
      p(17, -7, 8, 3, 1.2, 1),
      p(28, -7, 7, 3, 1.2, 1),
      {
        ...p(23, -7, 2.2, 3, 1.2, 1),
        kind: "moving",
        motion: { axis: "x", range: 1.7, period: 5 },
      },
      { ...p(12.4, 0, 0.5, 3, 5, 5), kind: "wall" },
      p(11, 0, 1.8, 2, 4.1, 0.4),
      p(11, -1.0, 3, 2.0, 0, 1),
    ],
    keys: [{ x: 11, y: 4.8, z: 0 }],
    stars: [
      { x: 5.5, y: 1.9, z: 0 },
      { x: 11, y: 2.8, z: -5 },
      { x: 23, y: 3, z: -7 },
    ],
    checkpoints: [
      { x: 8, y: 0, z: 0 },
      { x: 17, y: 1.2, z: -7 },
    ],
    signs: [
      { x: 8, y: 0.4, z: 0, text: "风柱会托起纸鹤" },
      { x: 11, y: 1, z: -6, text: "Q · 找到高处的路" },
      { x: 20, y: 1.5, z: -7, text: "等纸台靠近，再跳" },
    ],
    pads: [],
    winds: [
      { x: 8.5, y: 0, z: 0, w: 3.2, d: 2.7, height: 5.5 },
      { x: 11, y: 0, z: -6, w: 2.8, d: 2.8, height: 3 },
    ],
    hazards: [],
  },
  {
    name: "一只也不能少",
    sub: "窗内的灯，为所有人亮着。",
    hint: "Q 转到侧面搭桥 · 跳过旺火 · 接通木桥后一起踩机关",
    color: "#465b70",
    sky: "#253446",
    spawn: { x: -1, y: 0, z: 0 },
    exit: { x: 31, y: 0, z: -8 },
    platforms: [
      p(1, 0, 7, 3, 0, 1),
      p(10, 0, 7, 3, 0, 1),
      p(11, -1.55, 3, 3.1, 0, 1),
      p(11, -7.35, 3, 3.3, 0, 1),
      p(12.6, -8, 0.2, 3, 0, 1),
      p(26.4, -8, 4.8, 3, 0, 1),
      { ...p(12.5, 0, 0.5, 3, 4.2, 4.2), kind: "wall" },
      p(17, -8, 1.1, 2, 1, 1),
      p(19, -8, 1.5, 2, 2.3, 0.4),
      { ...p(11, -4.1, 3.4, 6.6, 12, 10.99), kind: "low-roof" },
      { ...p(9.3, -4.05, 0.2, 6.5, 12, 12), kind: "railing" },
      { ...p(12.7, -4.05, 0.2, 6.5, 12, 12), kind: "railing" },
      p(17.8, -8, 7.4, 3, 0, 1),
      p(32.1, -8, 3.8, 3, 0, 1),
    ],
    keys: [
      { x: 19, y: 2.9, z: -8 },
      { x: 11, y: 0.6, z: -6.5 },
    ],
    stars: [
      { x: 5.5, y: 1.8, z: 0 },
      { x: 11, y: 0.55, z: -4.4 },
      { x: 23, y: 2, z: -8 },
    ],
    checkpoints: [
      { x: 8, y: 0, z: 0 },
      { x: 15, y: 0, z: -8 },
      { x: 27, y: 0, z: -8 },
    ],
    signs: [
      { x: 2, y: 0, z: 0, text: "小火烤干 · 旺火必须跳过" },
      { x: 10, y: 0.6, z: 0, text: "Q · 换一条轴前进" },
      { x: 11, y: -0.8, z: -2.6, text: "侧面对齐桥钉 · Shift 搭桥" },
      { x: 27, y: 0.4, z: -8, text: "踩住 4 秒 · 一起挡雨开门" },
    ],
    pads: [
      { x: 26, y: 0, z: -8 },
      { x: 28, y: 0, z: -8 },
    ],
    gate: { ...p(29.3, -8, 0.4, 3, 3.8, 3.8), kind: "wall" },
    winds: [],
    hazards: [
      { x: 8.8, y: 0, z: 0, w: 1.1, d: 2.8 },
      { x: 30, y: 0, z: -8, w: 0.7, d: 2.7 },
    ],
  },
  ...EXTRA_LEVELS,
  ...CHALLENGE_MAPS.map((m) => m.level),
];
LEVELS.forEach((level, i) => {
  BLAZE_ROOFS[i] = blazeRoofsFor(level);
});
export interface Input {
  axis: number;
  jump: boolean;
  fold: boolean;
  turn: boolean;
  reset: boolean;
  shelter: boolean;
  repair: boolean;
}
export const idleInput = (): Input => ({
  axis: 0,
  jump: false,
  fold: false,
  turn: false,
  reset: false,
  shelter: false,
  repair: false,
});
export interface Bird extends Point {
  id: number;
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  folded: boolean;
  sheltering: boolean;
  wetness: number;
  heat: number;
  nearFire: boolean;
  lastFailure: "fall" | "soaked" | "scorched" | "brittle" | null;
  failureUntil: number;
  foldsLeft: number;
  repairProgress: number;
  foldBlocked: boolean;
  bridgeDock: boolean;
  bridgeFrom: -1 | 1;
  bridgeAxis: "x" | "z" | null;
  rainCover: "dry" | "rain" | "roof" | "ally" | "self";
  facing: number;
  checkpoint: number;
  carriedKeys: number[];
  carriedStars: number[];
  lastDropped: number;
  lastBanked: number;
  bankedUntil: number;
  deaths: number;
  arrived: boolean;
  coyote: number;
  jumpBuffer: number;
  wasJump: boolean;
  wasTurn: boolean;
  wasReset: boolean;
  invulnerable: number;
  support: number;
}
export interface Game {
  rulesVersion: number;
  id: string;
  mode: Mode;
  level: number;
  tick: number;
  time: number;
  motionTime: number;
  view: 0 | 1;
  flipAt: number;
  flips: number;
  players: Bird[];
  keys: number[];
  stars: number[];
  savedKeys: number[];
  savedStars: number[];
  gateOpen: boolean;
  gateCharge: number;
  bridgeLatched: boolean;
  bridgeCharge: number;
  status: "playing" | "won";
}
export type Inputs = Record<number, Input>;
export function isMode(v: unknown): v is Mode {
  return MODES.includes(v as Mode);
}
export function newGame(mode: Mode, level = 0, id = "solo"): Game {
  if (!isMode(mode) || !LEVELS[level]) throw new Error("无效模式或关卡");
  return {
    rulesVersion: CAMPAIGN_VERSION,
    id,
    mode,
    level,
    tick: 0,
    time: 0,
    motionTime: 0,
    view: 0,
    flipAt: -10,
    flips: 0,
    keys: [],
    stars: [],
    savedKeys: [],
    savedStars: [],
    gateOpen: false,
    gateCharge: 0,
    bridgeLatched: false,
    bridgeCharge: 0,
    status: "playing",
    players: Array.from({ length: mode }, (_, i) => ({
      id: i,
      ...LEVELS[level].spawn,
      x: LEVELS[level].spawn.x + i * 0.75,
      vx: 0,
      vz: 0,
      vy: 0,
      grounded: true,
      folded: false,
      sheltering: false,
      wetness: 0,
      heat: 0,
      nearFire: false,
      lastFailure: null,
      failureUntil: 0,
      foldsLeft: MAX_FOLDS,
      repairProgress: 0,
      foldBlocked: false,
      bridgeDock: false,
      bridgeFrom: -1,
      bridgeAxis: null,
      rainCover: "dry",
      facing: 1,
      checkpoint: -1,
      carriedKeys: [],
      carriedStars: [],
      lastDropped: 0,
      lastBanked: 0,
      bankedUntil: 0,
      deaths: 0,
      arrived: false,
      coyote: 0.12,
      jumpBuffer: 0,
      wasJump: false,
      wasTurn: false,
      wasReset: false,
      invulnerable: 0,
      support: 0,
    })),
  };
}
export function platformAt(p: Platform, time: number): Platform {
  if (!p.motion) return p;
  return {
    ...p,
    [p.motion.axis]:
      p[p.motion.axis] +
      Math.sin((time * Math.PI * 2) / p.motion.period) * p.motion.range,
  };
}
export function bodies(g: Game): Platform[] {
  const l = LEVELS[g.level];
  return [
    ...l.platforms.map((p) => platformAt(p, g.motionTime)),
    ...(l.gate && !g.gateOpen ? [l.gate] : []),
    ...(bridgePlank(g) ? [bridgePlank(g)!] : []),
  ];
}
export function height(p: Bird): number {
  return p.folded ? 0.28 : 0.88;
}
export function width(p: Bird, view: 0 | 1, axis: "x" | "z"): number {
  return p.folded
    ? (p.bridgeAxis ?? (view === 0 ? "x" : "z")) === axis
      ? 3.2
      : 0.9
    : 0.56;
}
function overlap(p: Bird, b: Platform, view: 0 | 1): boolean {
  return (
    Math.abs(p.x - b.x) < b.w / 2 + width(p, view, "x") / 2 - 0.001 &&
    Math.abs(p.z - b.z) < b.d / 2 + width(p, view, "z") / 2 - 0.001
  );
}
export function atRepairRack(g: Game, p: Bird): boolean {
  const l = LEVELS[g.level];
  return (
    p.grounded &&
    [l.spawn, ...l.checkpoints].some(
      (c) =>
        Math.hypot(c.x - p.x, c.z - p.z) < 1.4 && Math.abs(c.y - p.y) < 0.4,
    )
  );
}
export function activeHazard(period: number | undefined, t: number): boolean {
  return !period || t % period < period * 0.48;
}
function respawn(g: Game, p: Bird, reason: Bird["lastFailure"] = "fall"): void {
  const l = LEVELS[g.level];
  dropCollectibles(g, p);
  const s = l.checkpoints[p.checkpoint] ?? l.spawn;
  const offset = (p.id % 3) * 0.4;
  const fireBesideRack = l.hazards.some(
    (h) => Math.abs(h.x - s.x) < 1.8 && Math.abs(h.z - s.z) < 1 && h.x > s.x,
  );
  Object.assign(p, {
    x: s.x + (fireBesideRack ? -offset : offset),
    y: s.y + 0.1,
    z: s.z,
    vx: 0,
    vz: 0,
    vy: 0,
    grounded: false,
    folded: false,
    sheltering: false,
    wetness: 0,
    heat: 0,
    nearFire: false,
    lastFailure: reason,
    failureUntil: g.time + 4,
    rainCover: "dry",
    repairProgress: 0,
    foldBlocked: false,
    bridgeDock: false,
    bridgeAxis: null,
    support: -1,
    coyote: 0,
    invulnerable: 1.2,
  });
  p.deaths++;
}
export function stepGame(g: Game, inputs: Inputs, dt = 1 / 60): void {
  if (g.status !== "playing") return;
  initializeCollectibles(g);
  g.gateCharge ??= 0;
  g.bridgeLatched ??= false;
  g.bridgeCharge ??= 0;
  g.tick++;
  g.time += dt;
  for (const p of g.players) {
    p.wetness ??= 0;
    p.heat ??= 0;
    p.nearFire ??= false;
    p.lastFailure ??= null;
    p.failureUntil ??= 0;
    p.foldsLeft ??= MAX_FOLDS;
    p.repairProgress ??= 0;
    p.foldBlocked ??= false;
    p.bridgeDock ??= false;
    p.bridgeFrom ??= -1;
    p.bridgeAxis ??= null;
    p.sheltering ??= false;
    p.rainCover ??= "dry";
    const i = inputs[p.id] ?? idleInput();
    if (i.turn && !p.wasTurn && !p.arrived && g.time - g.flipAt > 0.8) {
      g.view = g.view === 0 ? 1 : 0;
      g.flipAt = g.time;
      g.flips++;
    }
    p.wasTurn = i.turn;
  }
  if (g.time - g.flipAt < 0.32) return;
  const oldTime = g.motionTime;
  g.motionTime += dt;
  const solid = bodies(g);
  const ordered = [...g.players].sort((a, b) => a.y - b.y);
  for (const p of ordered) {
    if (p.arrived) continue;
    const input = inputs[p.id] ?? idleInput();
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    if (input.reset && !p.wasReset) respawn(g, p, null);
    p.wasReset = input.reset;
    if (input.jump && !p.wasJump) p.jumpBuffer = 0.12;
    p.wasJump = input.jump;
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    p.coyote = p.grounded ? 0.12 : Math.max(0, p.coyote - dt);
    if (
      p.grounded &&
      p.support >= 0 &&
      LEVELS[g.level].platforms[p.support]?.motion
    ) {
      const before = platformAt(LEVELS[g.level].platforms[p.support], oldTime);
      const after = solid[p.support];
      p.x += after.x - before.x;
      p.z += after.z - before.z;
    }
    const crossing = CROSSINGS[g.level];
    if (p.bridgeDock && (!input.fold || input.shelter || !crossing)) {
      const restore =
        crossing && !g.bridgeLatched
          ? bankPoint(crossing, p.bridgeFrom)
          : { ...p, y: crossing?.y ?? p.y };
      Object.assign(p, {
        x: restore.x,
        y: restore.y,
        z: restore.z,
        bridgeDock: false,
        bridgeAxis: null,
        grounded: true,
      });
    }
    const repairing =
      input.repair === true &&
      atRepairRack(g, p) &&
      !input.axis &&
      !input.jump &&
      !input.shelter &&
      !input.fold;
    p.repairProgress = repairing
      ? Math.min(REPAIR_SECONDS, p.repairProgress + dt)
      : 0;
    if (p.repairProgress >= REPAIR_SECONDS) {
      p.foldsLeft = MAX_FOLDS;
    }
    const desired =
      p.grounded && !repairing
        ? input.shelter
          ? "sheet"
          : input.fold
            ? "bridge"
            : "crane"
        : "crane";
    const previous = p.sheltering ? "sheet" : p.folded ? "bridge" : "crane";
    const cost = p.wetness >= 60 ? 2 : 1;
    const changing = desired !== "crane" && desired !== previous;
    p.foldBlocked = changing && p.foldsLeft < cost;
    if (changing && !p.foldBlocked) p.foldsLeft -= cost;
    p.sheltering = desired === "sheet" && !p.foldBlocked;
    p.folded = desired === "bridge" && !p.foldBlocked;
    if (crossing && p.folded && !p.bridgeDock && !g.bridgeLatched) {
      const side = dockBank(crossing, p, g.view);
      if (side !== null) {
        p.bridgeDock = true;
        p.bridgeFrom = side;
        p.bridgeAxis = crossing.axis;
      }
    }
    if (p.bridgeDock && crossing) {
      Object.assign(p, {
        x: crossing.x,
        z: crossing.z,
        y: crossing.y - 0.28,
        vx: 0,
        vz: 0,
        vy: 0,
        grounded: true,
      });
    }
    if (p.jumpBuffer > 0 && p.coyote > 0 && !p.folded && !p.sheltering) {
      p.vy = 9.3;
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
    }
    const axis = g.view === 0 ? "x" : "z";
    const dir = g.view === 0 ? 1 : -1;
    const speed =
      p.folded || p.sheltering
        ? 0
        : Math.max(-1, Math.min(1, input.axis)) * 5.3 * dir;
    const velocity = axis === "x" ? "vx" : "vz";
    const other = axis === "x" ? "vz" : "vx";
    p[other] = 0;
    p[velocity] += Math.max(-48 * dt, Math.min(48 * dt, speed - p[velocity]));
    if (input.axis) p.facing = input.axis;
    const prev = p[axis];
    p[axis] += p[velocity] * dt;
    for (const b of solid) {
      if (
        p.y < b.y - 0.035 &&
        p.y + height(p) > b.y - b.h + 0.02 &&
        overlap(p, b, g.view)
      ) {
        if (p[velocity] > 0)
          p[axis] = Math.min(
            p[axis],
            b[axis] -
              (axis === "x" ? b.w : b.d) / 2 -
              width(p, g.view, axis) / 2,
          );
        if (p[velocity] < 0)
          p[axis] = Math.max(
            p[axis],
            b[axis] +
              (axis === "x" ? b.w : b.d) / 2 +
              width(p, g.view, axis) / 2,
          );
        p[velocity] = 0;
      }
    }
    const previousY = p.y;
    let gravity = 25;
    if (input.jump && p.vy < 0 && !p.folded) gravity = 5;
    p.vy -= gravity * dt;
    if (input.jump && p.vy < -2.5) p.vy = -2.5;
    for (const wind of LEVELS[g.level].winds) {
      if (
        Math.abs(p.x - wind.x) < wind.w / 2 &&
        Math.abs(p.z - wind.z) < wind.d / 2 &&
        p.y < wind.y + wind.height &&
        p.y >= wind.y - 0.2
      ) {
        p.vy = Math.min(6.2, p.vy + 37 * dt);
      }
    }
    p.y += p.vy * dt;
    p.grounded = false;
    p.support = -1;
    const land = (b: Platform, index: number) => {
      // A free paper bridge needs support under its centre, not just a wing tip.
      if (!overlap(p.folded ? { ...p, folded: false } : p, b, g.view)) return;
      if (p.vy <= 0 && previousY >= b.y - 0.065 && p.y <= b.y) {
        p.y = b.y;
        p.vy = 0;
        p.grounded = true;
        p.support = index;
      } else if (
        p.vy > 0 &&
        previousY + height(p) <= b.y - b.h + 0.04 &&
        p.y + height(p) >= b.y - b.h
      ) {
        p.y = b.y - b.h - height(p);
        p.vy = 0;
      }
    };
    solid.forEach(land);
    for (const otherBird of g.players) {
      if (
        otherBird.id === p.id ||
        otherBird.arrived ||
        otherBird.y >= previousY + 0.05
      )
        continue;
      land(
        {
          x: otherBird.x,
          z: otherBird.z,
          y: otherBird.y + height(otherBird),
          h: height(otherBird),
          w: width(otherBird, g.view, "x"),
          d: width(otherBird, g.view, "z"),
        },
        -2 - otherBird.id,
      );
    }
    if (p.bridgeDock && crossing) {
      p.y = crossing.y - 0.28;
      p.vy = 0;
      p.grounded = true;
      p.support = -100;
    }
    // Folded wings need support beneath the body, not only the tips; they cannot fly across gaps.
    if (p.folded && !p.grounded) p.folded = false;
    if (!p.grounded) p.sheltering = false;
    const l = LEVELS[g.level];
    if (p.y < -7 || Math.abs(p.x) > 80 || Math.abs(p.z) > 50) {
      respawn(g, p);
      continue;
    }
    if (
      !p.invulnerable &&
      l.hazards.some(
        (h) =>
          activeHazard(h.period, g.time) &&
          Math.abs(p.x - h.x) < h.w / 2 + 0.22 &&
          Math.abs(p.z - h.z) < h.d / 2 + 0.22 &&
          p.y < h.y + BLAZE_HEIGHT &&
          p.y > h.y - 0.5,
      )
    ) {
      respawn(g, p, "scorched");
      continue;
    }
    let reachedCheckpoint = false;
    l.checkpoints.forEach((c, index) => {
      if (
        index > p.checkpoint &&
        Math.hypot(c.x - p.x, c.z - p.z) < 1.1 &&
        Math.abs(c.y - p.y) < 1
      ) {
        p.checkpoint = index;
        reachedCheckpoint = true;
        p.foldsLeft = MAX_FOLDS;
        p.repairProgress = 0;
      }
    });
    l.keys.forEach((k, index) => {
      if (
        !g.keys.includes(index) &&
        Math.hypot(k.x - p.x, k.z - p.z) < 0.8 &&
        Math.abs(k.y - (p.y + 0.45)) < 0.9
      )
        collect(g, p, "keys", index);
    });
    l.stars.forEach((k, index) => {
      if (
        !g.stars.includes(index) &&
        Math.hypot(k.x - p.x, k.z - p.z) < 0.85 &&
        Math.abs(k.y - (p.y + 0.45)) < 1
      )
        collect(g, p, "stars", index);
    });
    if (reachedCheckpoint) bankCollectibles(g, p);
    if (
      g.keys.length === l.keys.length &&
      Math.hypot(l.exit.x - p.x, l.exit.z - p.z) < 1 &&
      Math.abs(l.exit.y - p.y) < 1.2
    ) {
      p.arrived = true;
      bankCollectibles(g, p);
      p.vx = 0;
      p.vz = 0;
      p.vy = 0;
    }
    if (!Number.isFinite(p.x + p.y + p.z)) {
      p[axis] = prev;
      respawn(g, p);
    }
  }
  const crossing = CROSSINGS[g.level];
  if (crossing && !g.bridgeLatched) {
    const holder = g.players.find((p) => p.bridgeDock && p.folded);
    // The far plate responds to whoever reaches it, regardless of their route.
    const releasing = g.players.some((p) => isOnBridgePlate(crossing, p));
    g.bridgeCharge =
      releasing || (g.mode === 1 && holder)
        ? Math.min(2, g.bridgeCharge + dt)
        : 0;
    if (g.bridgeCharge >= 2) g.bridgeLatched = true;
  }
  applyRain(g, dt);
  const l = LEVELS[g.level];
  if (l.pads.length && !g.gateOpen) {
    const required = Math.min(g.mode, l.pads.length);
    const lit = l.pads
      .slice(0, required)
      .filter((pad) =>
        g.players.some(
          (p) =>
            !p.arrived &&
            Math.hypot(pad.x - p.x, pad.z - p.z) < 0.75 &&
            Math.abs(pad.y - p.y) < 0.4,
        ),
      );
    g.gateCharge = lit.length === required ? Math.min(4, g.gateCharge + dt) : 0;
    if (g.gateCharge >= 4) g.gateOpen = true;
  }
  if (g.players.every((p) => p.arrived) && g.keys.length === l.keys.length)
    g.status = "won";
}
export function rainCover(g: Game, p: Bird): Bird["rainCover"] {
  if (
    underAwning(g.level, p) ||
    bodies(g).some(
      (b) =>
        b.y - b.h > p.y + 0.88 &&
        Math.abs(p.x - b.x) < b.w / 2 &&
        Math.abs(p.z - b.z) < b.d / 2,
    )
  )
    return "roof";
  if (!rainfall(g.level, p, g.motionTime)) return "dry";
  if (
    g.players.some(
      (q) =>
        q.id !== p.id &&
        !q.arrived &&
        q.sheltering &&
        q.grounded &&
        Math.abs(q.x - p.x) < SHIELD_RADIUS &&
        Math.abs(q.z - p.z) < SHIELD_RADIUS &&
        p.y + 0.88 <= q.y + 1.5 &&
        p.y >= q.y - 2.5,
    )
  )
    return "ally";
  return p.sheltering ? "self" : "rain";
}
export function applyRain(g: Game, dt: number): void {
  // Resolve protection simultaneously, before wet birds respawn, so slot order cannot affect cover.
  const states = g.players.map((p) => rainCover(g, p));
  g.players.forEach((p, index) => {
    if (p.arrived) return;
    p.rainCover = states[index];
    p.nearFire = besideCampfire(g.level, p);
    if (p.invulnerable > 0) return;
    const rate = rainfall(g.level, p, g.motionTime);
    const change =
      p.rainCover === "rain" ? rate : p.rainCover === "self" ? rate * 0.28 : 0;
    p.wetness = Math.max(
      0,
      Math.min(
        100,
        (p.wetness ?? 0) + (change - (p.nearFire ? FIRE_DRY_RATE : 0)) * dt,
      ),
    );
    p.heat = Math.max(
      0,
      Math.min(
        100,
        (p.heat ?? 0) + (p.nearFire ? FIRE_HEAT_RATE : -FIRE_COOL_RATE) * dt,
      ),
    );
    if (p.heat >= 100) respawn(g, p, "brittle");
    else if (p.wetness >= 100) respawn(g, p, "soaked");
  });
}
export function cleanInput(value: unknown): Input | null {
  if (!value || typeof value !== "object") return null;
  const i = value as Record<string, unknown>;
  if (
    ![-1, 0, 1].includes(i.axis as number) ||
    ["jump", "fold", "turn", "reset"].some((k) => typeof i[k] !== "boolean") ||
    ["shelter", "repair"].some(
      (k) => i[k] !== undefined && typeof i[k] !== "boolean",
    )
  )
    return null;
  return {
    axis: i.axis as number,
    jump: i.jump as boolean,
    fold: i.fold as boolean,
    turn: i.turn as boolean,
    reset: i.reset as boolean,
    shelter: i.shelter === true,
    repair: i.repair === true,
  };
}
