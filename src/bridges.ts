import type { Game, Platform, Point } from "./game";
export interface BridgeCrossing extends Point {
  axis: "x" | "z";
  near: -1 | 1;
  span: number;
  depth: number;
}
export const CROSSINGS: Record<number, BridgeCrossing> = {
  1: { x: 5.2, y: 0, z: 0, axis: "x", near: -1, span: 2.6, depth: 3 },
  3: { x: 11, y: 0, z: -4.4, axis: "z", near: 1, span: 2.6, depth: 3 },
};
export function bankPoint(c: BridgeCrossing, side: -1 | 1): Point {
  return {
    x: c.x,
    y: c.y,
    z: c.z,
    [c.axis]: c[c.axis] + side * (c.span / 2 + 0.5),
  };
}
export function bridgePlank(g: Game): Platform | null {
  const c = CROSSINGS[g.level];
  if (!c || !g.bridgeLatched) return null;
  return {
    x: c.x,
    y: c.y,
    z: c.z,
    w: c.axis === "x" ? c.span + 0.35 : c.depth,
    d: c.axis === "z" ? c.span + 0.35 : c.depth,
    h: 0.18,
  };
}
export function dockBank(
  c: BridgeCrossing,
  p: Point,
  view: 0 | 1,
): -1 | 1 | null {
  if ((c.axis === "x" ? 0 : 1) !== view || Math.abs(p.y - c.y) > 0.35)
    return null;
  const other = c.axis === "x" ? "z" : "x";
  if (Math.abs(p[other] - c[other]) > 0.5) return null;
  for (const side of [-1, 1] as const) {
    if (Math.abs(p[c.axis] - bankPoint(c, side)[c.axis]) < 0.5) return side;
  }
  return null;
}
