import {
  LEVELS,
  MAX_FOLDS,
  REPAIR_SECONDS,
  atRepairRack,
  type Game,
  type Point,
} from "./game";
import { CROSSINGS, bankPoint, dockBank, isOnBridgePlate } from "./bridges";
import { gateState } from "./gate-state";
import type { Language } from "./i18n";

export type SocketState = "idle" | "aligned" | "holding" | "complete";
export function bridgeSocketState(g: Game, side: -1 | 1): SocketState {
  const crossing = CROSSINGS[g.level];
  if (!crossing) return "idle";
  if (g.bridgeLatched) return "complete";
  if (
    g.players.some(
      (p) => !p.arrived && p.bridgeDock && p.folded && p.bridgeFrom === side,
    )
  )
    return "holding";
  if (
    g.players.some(
      (p) =>
        !p.arrived &&
        !p.bridgeDock &&
        p.grounded &&
        dockBank(crossing, p, g.view) === side,
    )
  )
    return "aligned";
  return "idle";
}

export interface MechanismFeedback {
  id: string;
  anchor: Point;
  title: string;
  detail: string;
  progress: number;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** Interaction state is independent of the optional route guide or chosen route. */
export function mechanismFeedback(
  g: Game,
  local: number,
  language: Language,
): MechanismFeedback[] {
  if (g.status !== "playing") return [];
  const viewer = g.players[local] ?? g.players[0];
  if (viewer.arrived) return [];
  const items: MechanismFeedback[] = [];
  const copy = (zh: string, en: string) => (language === "zh" ? zh : en);
  const timer = (charge: number, duration: number) => {
    const seconds = (
      Math.ceil(Math.max(0, duration - charge) * 10) / 10
    ).toFixed(1);
    return copy(`还需 ${seconds} 秒`, `${seconds}s left`);
  };
  const crossing = CROSSINGS[g.level];
  if (crossing && !g.bridgeLatched) {
    const holder = g.players.find(
      (p) => !p.arrived && p.bridgeDock && p.folded,
    );
    const pressed = g.players.some((p) => isOnBridgePlate(crossing, p));
    if (holder || pressed) {
      const charging = pressed || (g.mode === 1 && !!holder);
      items.push({
        id: "bridge",
        anchor:
          viewer.bridgeDock || !pressed
            ? crossing
            : bankPoint(crossing, crossing.near === -1 ? 1 : -1),
        title: copy(
          charging ? "接通木桥" : "纸桥已撑起",
          charging ? "Lowering bridge" : "Paper bridge held",
        ),
        detail: charging
          ? copy("继续保持 · ", "Keep holding · ") + timer(g.bridgeCharge, 2)
          : copy("等同伴踩对岸方板", "Hold the far square plate"),
        progress: charging ? g.bridgeCharge / 2 : 0,
      });
    }
  }
  if (!g.gateOpen) {
    const state = gateState(g);
    const pressed = state.pads.filter((_, i) => state.pressed[i]);
    if (pressed.length) {
      const anchor = pressed.reduce((a, b) =>
        distance(viewer, a) <= distance(viewer, b) ? a : b,
      );
      const missing = state.required - state.occupied;
      items.push({
        id: "gate",
        anchor,
        title: copy(
          `开门踏板 ${state.occupied}/${state.required}`,
          `Gate plates ${state.occupied}/${state.required}`,
        ),
        detail: missing
          ? copy(
              `还差 ${missing} 人 · 各踩一块`,
              `Need ${missing} more · One per plate`,
            )
          : copy("继续踩住 · ", "Keep holding · ") + timer(g.gateCharge, 4),
        progress: missing ? 0 : g.gateCharge / 4,
      });
    }
  }
  const racks = [LEVELS[g.level].spawn, ...LEVELS[g.level].checkpoints];
  // Co-located players share one small card; the viewer's own repair wins.
  const repairing = [...g.players].sort(
    (a, b) => Number(b.id === viewer.id) - Number(a.id === viewer.id),
  );
  for (const p of repairing) {
    if (
      p.arrived ||
      p.foldsLeft >= MAX_FOLDS ||
      p.repairProgress <= 0 ||
      p.repairProgress >= REPAIR_SECONDS ||
      !atRepairRack(g, p)
    )
      continue;
    const rack = racks.reduce(
      (best, point, i) =>
        distance(p, point) < distance(p, racks[best]) ? i : best,
      0,
    );
    const id = `repair-${rack}`;
    if (items.some((item) => item.id === id)) continue;
    items.push({
      id,
      anchor: racks[rack],
      title:
        copy("修补纸张", "Mending paper") +
        (g.mode > 1 ? ` · ${p.id + 1}` : ""),
      detail:
        copy("继续按住 · ", "Keep holding · ") +
        timer(p.repairProgress, REPAIR_SECONDS),
      progress: p.repairProgress / REPAIR_SECONDS,
    });
  }
  return items.filter(
    (item) =>
      distance(viewer, item.anchor) < 9 &&
      Math.abs(viewer.y - item.anchor.y) < 4 &&
      Math.abs(
        g.view === 0 ? viewer.z - item.anchor.z : viewer.x - item.anchor.x,
      ) < 1.7,
  );
}
