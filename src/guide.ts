import {
  LEVELS,
  atRepairRack,
  activeHazard,
  platformAt,
  type Bird,
  type Game,
  type Point,
} from "./game";
import { CROSSINGS, bankPoint } from "./bridges";
import { CHALLENGE_MAPS } from "./challenge-maps";
import type { Language } from "./i18n";
export type Copy = readonly [string, string];
export const words = (value: Copy, language: Language) =>
  value[language === "en" ? 1 : 0];
export type Lesson =
  "basics" | "turn" | "bridge" | "rain" | "save" | "wind" | "gate";
export type StepKind =
  | "walk"
  | "jump"
  | "rack"
  | "key"
  | "bridge"
  | "wind"
  | "ferry"
  | "pads"
  | "exit";
export interface RouteStep {
  kind: StepKind;
  target: Point;
  view: 0 | 1;
  id?: number;
  from?: Point;
  requiredKey?: number;
}
const pt = (x: number, z: number, y = 0): Point => ({ x, y, z });
const walk = (x: number, z: number, view: 0 | 1 = 0, y = 0): RouteStep => ({
  kind: "walk",
  target: pt(x, z, y),
  view,
});
const jump = (x: number, z: number, y = 0): RouteStep => ({
  ...walk(x, z, 0, y),
  kind: "jump",
});
const rack = (level: number, id: number): RouteStep => ({
  kind: "rack",
  target: LEVELS[level].checkpoints[id],
  view: 0,
  id,
});
const key = (level: number, id: number, view: 0 | 1 = 0): RouteStep => ({
  kind: "key",
  target: { ...LEVELS[level].keys[id], y: LEVELS[level].keys[id].y - 0.7 },
  view,
  id,
});
const bridge = (level: number): RouteStep => {
  const c = CROSSINGS[level];
  return {
    kind: "bridge",
    target: bankPoint(c, c.near === -1 ? 1 : -1),
    view: c.axis === "x" ? 0 : 1,
  };
};
const wind = (x: number, z: number, y: number, from: Point): RouteStep => ({
  kind: "wind",
  target: pt(x, z, y),
  view: 0,
  from,
});
const ferry = (
  id: number,
  x: number,
  z: number,
  y = 0,
  requiredKey?: number,
): RouteStep => ({
  kind: "ferry",
  target: pt(x, z, y),
  view: 0,
  id,
  requiredKey,
});
const pads = (level: number): RouteStep => ({
  kind: "pads",
  target: LEVELS[level].pads[0],
  view: 0,
});
const exit = (level: number): RouteStep => ({
  kind: "exit",
  target: LEVELS[level].exit,
  view: 0,
});
export const GUIDE_ROUTES: RouteStep[][] = [
  [
    walk(3.5, 0),
    jump(8, 0),
    rack(0, 0),
    walk(11, 0),
    walk(11, -7, 1),
    key(0, 0),
    rack(0, 1),
    walk(20.5, -7),
    jump(26, -7),
    exit(0),
  ],
  [
    walk(3.4, 0),
    bridge(1),
    rack(1, 0),
    jump(9, 0, 1),
    key(1, 0),
    walk(11, 0),
    walk(11, -7, 1),
    rack(1, 1),
    pads(1),
    walk(20.7, -7),
    jump(26, -7),
    exit(1),
  ],
  [
    walk(3.5, 0),
    jump(7.5, 0),
    wind(11, 0, 4.1, pt(8.5, 0)),
    key(2, 0),
    walk(11, -7, 1),
    jump(16, -7, 1.2),
    rack(2, 1),
    walk(20, -7, 0, 1.2),
    ferry(5, 26, -7, 1.2),
    exit(2),
  ],
  [
    walk(3.5, 0),
    jump(7, 0),
    rack(3, 0),
    jump(11, 0),
    walk(11, -2.6, 1),
    bridge(3),
    key(3, 1, 1),
    walk(11, -8, 1),
    rack(3, 1),
    jump(17, -8, 1),
    key(3, 0),
    walk(20.5, -8),
    jump(26, -8),
    rack(3, 2),
    pads(3),
    walk(28, -8),
    jump(31, -8),
    exit(3),
  ],
  [
    walk(3.5, 0),
    jump(8, 0),
    rack(4, 0),
    key(4, 0, 1),
    walk(8, 6, 1),
    rack(4, 1),
    walk(13.7, 6),
    jump(15, 6, 1),
    key(4, 1),
    walk(19, 6),
    walk(19, -2, 1),
    walk(19.9, -2),
    jump(23, -2),
    rack(4, 2),
    key(4, 2),
    pads(4),
    exit(4),
  ],
  [
    walk(3.5, 0),
    ferry(2, 14, 0, 0, 0),
    rack(5, 0),
    wind(18, 0, 3.3, pt(16.5, 0)),
    key(5, 1, 1),
    walk(18, -7, 1, 3.3),
    rack(5, 1),
    walk(23.6, -7, 0, 3.3),
    ferry(7, 34.5, -7, 3.3, 2),
    rack(5, 2),
    exit(5),
  ],
  [
    walk(3.5, 0),
    jump(8, 0),
    key(6, 0, 1),
    walk(8, 6, 1),
    rack(6, 0),
    walk(13.4, 6),
    bridge(6),
    key(6, 1),
    jump(23, 6),
    rack(6, 1),
    walk(23, 12, 1),
    walk(22, 12),
    jump(16.9, 12),
    rack(6, 2),
    jump(15.4, 12, 1),
    key(6, 2),
    pads(6),
    exit(6),
  ],
  [
    walk(3.5, 0),
    jump(7.5, 0),
    wind(12, 0, 4.1, pt(9, 0)),
    key(7, 0),
    rack(7, 0),
    walk(12, -8, 1, 4.1),
    walk(3.7, -8, 0, 4.1),
    jump(0, -8, 4.1),
    key(7, 1),
    rack(7, 1),
    walk(0, -16, 1, 2.5),
    rack(7, 2),
    walk(10.2, -16, 0, 1.2),
    ferry(8, 18.2, -16, 1.2, 2),
    rack(7, 3),
    pads(7),
    walk(19.3, -16, 0, 1.2),
    jump(22.5, -16, 1.2),
    exit(7),
  ],
  ...CHALLENGE_MAPS.map((m) => m.route),
];
export interface GuideTracker {
  gameId: string;
  level: number;
  slot: number;
  deaths: number;
  index: number;
}
export const newGuideTracker = (): GuideTracker => ({
  gameId: "",
  level: -1,
  slot: -1,
  deaths: 0,
  index: 0,
});
export interface Guidance {
  step: number;
  total: number;
  kind: StepKind;
  lesson: Lesson;
  title: Copy;
  body: Copy;
  keys: string[];
  target?: Point;
  warning?: Copy;
  progress?: number;
  direction?: "left" | "right" | "turn" | "up" | "stay";
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
function reached(g: Game, p: Bird, s: RouteStep, previous: Point): boolean {
  if (s.kind === "key") return g.keys.includes(s.id!);
  if (s.requiredKey !== undefined && !g.keys.includes(s.requiredKey))
    return false;
  if (s.kind === "rack") return p.checkpoint >= s.id!;
  if (s.kind === "pads") return g.gateOpen;
  if (s.kind === "exit") return p.arrived;
  if (s.kind === "bridge" && !g.bridgeLatched) return false;
  if (s.kind === "wind")
    return distance(p, s.target) < 1.1 && p.y >= s.target.y - 0.35;
  const a = s.view === 0 ? "x" : "z",
    other = a === "x" ? "z" : "x",
    sign = Math.sign(s.target[a] - previous[a]);
  return (
    (distance(p, s.target) < 0.75 ||
      (sign !== 0 &&
        (p[a] - s.target[a]) * sign >= -0.22 &&
        Math.abs(p[other] - s.target[other]) < 1.1)) &&
    p.y >= s.target.y - 0.4
  );
}
function checkpointIndex(g: Game, p: Bird): number {
  const route = GUIDE_ROUTES[g.level];
  return Math.max(
    0,
    ...route.map((s, i) =>
      s.kind === "rack" && s.id! <= p.checkpoint ? i + 1 : 0,
    ),
  );
}
export function guideFor(
  g: Game,
  slot: number,
  tracker: GuideTracker,
): Guidance {
  const p = g.players[slot] ?? g.players[0],
    route = GUIDE_ROUTES[g.level],
    l = LEVELS[g.level];
  if (
    tracker.gameId !== g.id ||
    tracker.level !== g.level ||
    tracker.slot !== slot ||
    tracker.deaths !== p.deaths
  ) {
    Object.assign(tracker, {
      gameId: g.id,
      level: g.level,
      slot,
      deaths: p.deaths,
      index: checkpointIndex(g, p),
    });
  }
  while (
    tracker.index < route.length - 1 &&
    reached(
      g,
      p,
      route[tracker.index],
      route[tracker.index - 1]?.target ?? l.spawn,
    )
  )
    tracker.index++;
  // A missed key still matters after reaching a later rack. Show its route on the map.
  const missingEarlier = route.findIndex(
    (s, i) =>
      i < tracker.index &&
      ((s.kind === "key" && !g.keys.includes(s.id!)) ||
        (s.requiredKey !== undefined && !g.keys.includes(s.requiredKey))),
  );
  const s = route[missingEarlier >= 0 ? missingEarlier : tracker.index];
  let target = { ...s.target },
    lesson: Lesson = "basics",
    title: Copy = ["沿走廊前进", "Follow the walkway"],
    body: Copy = [
      "跟随金色空心路标；到达后会出现下一步。",
      "Follow the hollow gold marker. The next step appears when you reach it.",
    ];
  let keys: string[] = [],
    progress: number | undefined;
  let waitForFerry = false;
  if (s.kind === "jump") {
    title = ["跳到对面的平台", "Jump to the far platform"];
    body = [
      "先走到边缘附近，再同时按方向键和空格；下落时继续按住空格滑翔。",
      "Approach the edge, then press a direction and Space together. Keep holding Space while falling to glide.",
    ];
    keys = ["空格"];
  }
  if (s.kind === "rack") {
    lesson = "save";
    title = ["到许愿架存下物品", "Save your items at the rack"];
    body = [
      "靠近下一个新许愿架会自动存档并补满耐折，不用按键。",
      "Approach the next new rack to save items and restore folds automatically. No button needed.",
    ];
  }
  if (s.kind === "key") {
    lesson = "save";
    title = ["取走这把钥匙", "Pick up this key"];
    body =
      s.target.y > p.y + 0.5
        ? [
            "钥匙在高处：借台阶逐级跳上去，靠近就能拾取。",
            "The key is above you. Jump up the steps; touch the key to collect it.",
          ]
        : [
            "靠近钥匙自动拾取。星星是加分挑战，不影响开门。",
            "Touch the key to collect it. Stars are optional and do not unlock the exit.",
          ];
    if (s.target.y > p.y + 0.5) keys = ["空格"];
  }
  if (s.kind === "wind") {
    lesson = "wind";
    const rising = p.y < s.target.y + 0.45;
    target = rising ? { ...s.from! } : target;
    title = rising
      ? ["站进风柱，等它托起你", "Enter the wind and let it lift you"]
      : ["现在移向高处的平台", "Now move onto the upper platform"];
    body = [
      "风柱会自动托起纸鹤；升到平台上方后，按方向键移过去。",
      "The wind lifts you automatically. Once above the ledge, move sideways onto it.",
    ];
  }
  if (s.kind === "ferry") {
    lesson = "wind";
    const platform = platformAt(l.platforms[s.id!], g.motionTime),
      riding = p.support === s.id;
    target = riding ? s.target : { ...platform };
    const hasKey =
      s.requiredKey === undefined || g.keys.includes(s.requiredKey);
    const ferryAxis = l.platforms[s.id!].motion?.axis ?? "x";
    const canJump =
      riding && hasKey && Math.abs(p[ferryAxis] - s.target[ferryAxis]) < 4.5;
    waitForFerry = riding ? !canJump : distance(p, platform) > 4.5;
    title = riding
      ? canJump
        ? ["现在跳向对岸", "Jump to the far bank now"]
        : ["站稳，随渡台靠岸", "Stay aboard as the ferry approaches"]
      : ["等移动渡台靠近，再跳上去", "Wait for the ferry, then jump aboard"];
    body = riding
      ? [
          "站稳后渡台会带你移动。靠岸再按方向键＋空格，别提前跳进长断口。",
          "The ferry carries you while you stand still. Jump with direction + Space near the bank.",
        ]
      : [
          "长断口不能直接越过。先落到移动平台上，再乘它去对岸。",
          "This gap is too wide to jump directly. Land on the moving platform and ride it across.",
        ];
    if (riding && !hasKey) {
      title = ["先随渡台经过钥匙", "Ride through the key first"];
      body = [
        "别急着上岸，先站稳，让渡台把你送到钥匙旁；拿到后再看跳跃提示。",
        "Stay aboard until the ferry carries you through the key, then watch for the cue to jump ashore.",
      ];
    }
    keys = !waitForFerry ? ["空格"] : [];
  }
  if (s.kind === "bridge") {
    lesson = "bridge";
    const c = CROSSINGS[g.level],
      holder = g.players.find((q) => q.bridgeDock),
      near = bankPoint(c, c.near),
      far = s.target;
    if (g.bridgeLatched) {
      target = far;
      title = ["木桥接通了，一起过桥", "The wooden bridge is ready"];
      body = [
        "搭桥者松开 Shift 还原，沿木桥走到对岸。",
        "Release Shift to refold, then walk across the wooden deck.",
      ];
    } else if (p.bridgeDock) {
      target = { ...p };
      title = ["保持纸桥，先不要松手", "Keep holding your paper bridge"];
      body =
        g.mode === 1
          ? [
              "单人按住 Shift 满 2 秒，木桥会自动接通。",
              "Solo: hold Shift for 2 seconds to lower the wooden deck.",
            ]
          : [
              "队友要从你的纸面走到对岸，再踩金色方板 2 秒来接应你。",
              "A friend must walk across your paper, then hold the far gold plate for 2 seconds.",
            ];
      keys = ["Shift"];
      progress = g.bridgeCharge / 2;
    } else if (holder) {
      target = far;
      title = g.bridgeCrossed.includes(p.id)
        ? ["在对岸方板上站住 2 秒", "Hold the far square plate for 2 seconds"]
        : ["从同伴的纸桥走过去", "Walk across your friend’s paper bridge"];
      body = [
        "先走过纸面，再站稳对岸金色方板；木桥放下后搭桥者才能跟上。",
        "Walk over the paper, then stand on the far gold plate so the bridge maker can follow.",
      ];
      progress = g.bridgeCharge / 2;
    } else {
      target = near;
      const ready =
        distance(p, near) < 0.4 && Math.abs(p.y - near.y) < 0.35 && p.grounded;
      title = ready
        ? ["对齐了，按住 Shift 搭桥", "Aligned! Hold Shift to bridge"]
        : ["先走到岸边金色桥钉", "First reach the gold bank pins"];
      body = ready
        ? [
            "低檐挡住了起跳。保持 Shift 不松手，等木桥接通再还原。",
            "Low eaves block jumping. Keep holding Shift until the wooden bridge is ready.",
          ]
        : [
            "先站到金色圈正中并落稳，再按 Shift。太早折桥会停在原地。",
            "Stand in the centre of the gold ring and land before pressing Shift. Folding too early stops you in place.",
          ];
      keys = ready ? ["Shift"] : [];
      if (p.folded) {
        title = [
          "先松开 Shift 还原，再对齐桥钉",
          "Release Shift, then align with the pins",
        ];
        keys = [];
      }
    }
  }
  if (s.kind === "pads") {
    lesson = "gate";
    const required = Math.min(g.mode, l.pads.length);
    target =
      l.pads
        .slice(0, required)
        .find(
          (pad) => distance(p, pad) < 0.75 && Math.abs(p.y - pad.y) < 0.4,
        ) ?? l.pads[p.id % required];
    title =
      g.mode === 1
        ? ["踩住开门踏板，保持 4 秒", "Hold the gate plate for 4 seconds"]
        : ["两人各踩一块开门踏板", "Put one friend on each gate plate"];
    body =
      g.mode === 1
        ? [
            "站到带门形标记的石踏板上，等四格灯亮满，门就会打开；淋雨时可按住 S 挡雨。",
            "Stand on the stone plate with a doorway mark until all four lights fill and the gate opens. Hold S to shelter from rain.",
          ]
        : [
            "两块带门形标记的石踏板需同时踩住 4 秒；其余队友可在旁边按 S 挡雨，中途离开会重新计时。",
            "Hold both doorway-marked stone plates together for 4 seconds. Other friends can hold S nearby to shelter them. Stepping away resets the timer.",
          ];
    keys =
      distance(p, target) < 0.65 && Math.abs(p.y - target.y) < 0.4 ? ["S"] : [];
    progress = g.gateCharge / 4;
  }
  if (s.kind === "exit") {
    lesson = "gate";
    title = p.arrived
      ? ["你已到家，等同伴抵达", "You are home. Wait for your friends"]
      : ["走进金色灯门", "Enter the golden lantern gate"];
    body = [
      "钥匙齐了，全员到灯门才通关。最后一段收集会在这里保存。",
      "With all keys collected, everyone must reach the gate. Your final items are saved here.",
    ];
  }
  let requiredView = s.view;
  // Racks and gates may lie around a corner; follow adjacent route points when a missed key is behind us.
  if (missingEarlier >= 0) {
    const nearby = route
      .map((r, i) => ({
        i,
        d: distance(p, r.target) + Math.abs(p.y - r.target.y) * 0.25,
      }))
      .filter((r) => r.i >= missingEarlier)
      .sort((a, b) => a.d - b.d)[0];
    if (nearby && nearby.i > missingEarlier + 1) {
      const back =
        route[nearby.i - (distance(p, route[nearby.i].target) < 1.25 ? 1 : 0)];
      target = back.target;
      requiredView =
        Math.abs(target.z - p.z) > Math.abs(target.x - p.x) ? 1 : 0;
    }
    title = [
      "还有钥匙没取，沿路标返回",
      "A key is missing. Follow the marker back",
    ];
  }
  // Any diagonal-looking corner must be aligned before changing to the other axis.
  if (s.kind === "rack" || s.kind === "pads" || s.kind === "exit")
    requiredView = Math.abs(target.z - p.z) > Math.abs(target.x - p.x) ? 1 : 0;
  const axis = requiredView === 0 ? "x" : "z",
    delta = (target[axis] - p[axis]) * (requiredView === 0 ? 1 : -1);
  let direction: Guidance["direction"] =
    Math.abs(delta) < (s.kind === "bridge" ? 0.25 : 0.6)
      ? "stay"
      : delta > 0
        ? "right"
        : "left";
  if (g.view !== requiredView && distance(p, target) > 0.65) {
    lesson = "turn";
    title = ["这里要换一个方向走", "Turn to reveal the other path"];
    body =
      requiredView === 1
        ? [
            "按一次 Q 转到侧面。左右键随后控制前后方向，纸鹤的位置不会改变。",
            "Press Q once for the side view. Left and right now move along the other axis; your crane stays in place.",
          ]
        : [
            "按一次 Q 回到正面，再沿新的左右方向继续。联机时全队视角一起转动。",
            "Press Q once to return to the front view, then continue left or right. The view turns for the whole team.",
          ];
    keys = ["Q"];
    direction = "turn";
  } else if (direction !== "stay")
    keys = [delta > 0 ? "→ / D" : "← / A", ...keys];
  if (
    s.kind === "wind" &&
    p.y < s.target.y + 0.45 &&
    distance(p, target) < 0.6
  ) {
    direction = "up";
    keys = [];
  }
  if (waitForFerry && direction !== "turn") {
    direction = "stay";
    keys = [];
  }
  let warning: Copy | undefined;
  if (p.heat >= 65) {
    warning = [
      "纸正在烤脆！马上离开火光圈，到 100 会失败。",
      "Paper is turning brittle! Leave the fire ring now; 100 heat causes failure.",
    ];
  } else if (p.nearFire && p.wetness < 5 && p.heat > 10) {
    warning = [
      "已经烤干，离开火边再继续。久留会烤脆。",
      "You are dry. Leave the fire before the paper turns brittle.",
    ];
  } else if (p.wetness >= 55) {
    warning = p.nearFire
      ? [
          "小火正在烤干纸张，干了就走；别等烘烤到 65。",
          "The small fire is drying you. Leave once dry, before heat reaches 65.",
        ]
      : [
          "纸已很湿：屋檐只挡雨，靠近小火才能烤干。S 不能烘干。",
          "Paper is wet: roofs block rain; only small fires dry it. S cannot dry paper.",
        ];
  } else if (
    l.hazards.some((h) => distance(p, h) < 3 && Math.abs(p.y - h.y) < 1.4)
  ) {
    warning = [
      "前方旺火碰到就失败，提前起跳，不要贴着火再跳。",
      "Blazing fire burns on contact. Jump early, before you get close.",
    ];
    const pulsing = l.hazards.find(
      (h) => h.period && distance(p, h) < 3 && Math.abs(p.y - h.y) < 1.4,
    );
    if (pulsing)
      warning = activeHazard(pulsing.period, g.time)
        ? [
            "前方是间歇旺火：等火焰熄灭再通过，或提前跳过。",
            "Pulsing fire ahead: wait for the flame to go out, or jump early.",
          ]
        : [
            "火焰暂时熄灭，可以通过；下一轮还会重新燃起。",
            "The flame is out briefly. Cross now; it will reignite next cycle.",
          ];
  } else if (p.foldsLeft <= 1) {
    warning = atRepairRack(g, p)
      ? [
          "耐折不足：站稳按住 F 两秒修补。",
          "Low folds: stand still and hold F for 2 seconds to mend.",
        ]
      : [
          "耐折快用完了，去许愿架修补。走、跳仍然可用。",
          "Folds are running low. Mend at a rack; you can still walk and jump.",
        ];
  }
  if (p.arrived)
    return {
      step: route.length,
      total: route.length,
      kind: "exit",
      lesson: "gate",
      title: ["你已到家，等同伴抵达", "You are home. Wait for your friends"],
      body: [
        "你已经安全抵达；等同伴带齐钥匙到灯门。",
        "You have arrived safely. Wait for your friends to bring the remaining keys home.",
      ],
      keys: [],
      direction: "stay",
    };
  return {
    step: tracker.index + 1,
    total: route.length,
    kind: s.kind,
    lesson,
    title,
    body,
    keys,
    target: p.arrived ? undefined : target,
    warning,
    progress,
    direction,
  };
}
