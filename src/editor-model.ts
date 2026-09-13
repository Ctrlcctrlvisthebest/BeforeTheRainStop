import { MAP_LIMITS, type MapFile } from "./map-format";
import type { Platform, Point } from "./game";
import { bankPoint } from "./bridges";
const defaultMotion = (): NonNullable<Platform["motion"]> => ({
  axis: "x",
  range: 2.2,
  period: 6,
});

export function platformStylePatch(
  platform: Platform,
  kind: string,
): Partial<Platform> {
  if (
    !["normal", "wall", "step", "moving", "low-roof", "railing"].includes(kind)
  )
    return {};
  return {
    kind: kind === "normal" ? undefined : (kind as Platform["kind"]),
    ...(kind === "moving" && !platform.motion
      ? { motion: defaultMotion() }
      : {}),
  };
}
export function platformMotionPatch(
  platform: Platform,
  moving: boolean,
): Partial<Platform> {
  return moving
    ? {
        motion: platform.motion ?? defaultMotion(),
        ...(platform.kind ? {} : { kind: "moving" }),
      }
    : {
        motion: undefined,
        ...(platform.kind === "moving" ? { kind: undefined } : {}),
      };
}

export type EntityKind =
  | "platforms"
  | "keys"
  | "stars"
  | "checkpoints"
  | "signs"
  | "pads"
  | "winds"
  | "hazards"
  | "awnings"
  | "zones"
  | "route"
  | "spawn"
  | "exit"
  | "gate"
  | "crossing";
export interface Selection {
  kind: EntityKind;
  index: number;
}
export type Tool = "select" | "pan" | EntityKind | "moving" | "wall";
export const entityNames: Record<EntityKind, string> = {
  platforms: "平台",
  keys: "钥匙",
  stars: "星星",
  checkpoints: "许愿架",
  signs: "路牌",
  pads: "开门踏板",
  winds: "风柱",
  hazards: "旺火",
  awnings: "篷子与小火",
  zones: "雨区",
  route: "引导点",
  spawn: "起点",
  exit: "终点",
  gate: "机关门",
  crossing: "纸桥断口",
};
export function entities(map: MapFile) {
  const result: (Selection & { data: any })[] = [];
  for (const kind of Object.keys(entityNames) as EntityKind[]) {
    const v = container(map, kind)[kind];
    if (Array.isArray(v))
      v.forEach((data, index) => result.push({ kind, index, data }));
    else if (v) result.push({ kind, index: 0, data: v });
  }
  return result;
}
function container(map: MapFile, kind: EntityKind): any {
  return kind === "crossing" || kind === "route"
    ? map
    : kind === "awnings" || kind === "zones"
      ? map.weather
      : map.level;
}
export function entity(map: MapFile, s: Selection): any {
  if (
    !Object.hasOwn(entityNames, s.kind) ||
    !Number.isInteger(s.index) ||
    s.index < 0
  )
    return undefined;
  const v = container(map, s.kind)[s.kind];
  return Array.isArray(v) ? v[s.index] : s.index === 0 ? v : undefined;
}
export function pointOf(data: any): Point {
  return data.target ?? { x: data.x, y: data.y ?? 0, z: data.z };
}
export function syncRoute(map: MapFile) {
  const exit = map.route.find((r) => r.kind === "exit") ?? {
    kind: "exit" as const,
    target: { ...map.level.exit },
    view: 0 as const,
  };
  map.route = map.route.filter((r) => r.kind !== "exit");
  if (!map.level.gate || !map.level.pads.length)
    map.route = map.route.filter((r) => r.kind !== "pads");
  else if (!map.route.some((r) => r.kind === "pads"))
    map.route.push({ kind: "pads", target: { ...map.level.pads[0] }, view: 0 });
  map.route.push(exit);
  map.route.forEach((r) => {
    if (r.kind === "key" && map.level.keys[r.id!])
      r.target = { ...map.level.keys[r.id!], y: map.level.keys[r.id!].y - 0.7 };
    if (r.kind === "rack" && map.level.checkpoints[r.id!])
      r.target = { ...map.level.checkpoints[r.id!] };
    if (r.kind === "exit") r.target = { ...map.level.exit };
    if (r.kind === "pads" && map.level.pads[0])
      r.target = { ...map.level.pads[0] };
    if (r.kind === "bridge" && map.crossing) {
      r.target = bankPoint(map.crossing, map.crossing.near === -1 ? 1 : -1);
      r.view = map.crossing.axis === "x" ? 0 : 1;
    }
  });
}
export function editEntity(
  map: MapFile,
  s: Selection,
  patch: Record<string, any>,
): MapFile {
  const next = structuredClone(map),
    item = entity(next, s);
  if (!item) return map;
  if (s.kind === "route") {
    const { x, y, z, ...rest } = patch;
    // The terminal route step is structural; changing its kind would recreate it.
    if (item.kind === "exit" && rest.kind && rest.kind !== "exit") return map;
    Object.assign(item, rest);
    if (!["key", "rack", "ferry"].includes(item.kind)) delete item.id;
    if (item.kind !== "ferry") delete item.requiredKey;
    if (item.kind !== "wind") delete item.from;
    if (x !== undefined) item.target.x = x;
    if (y !== undefined) item.target.y = y;
    if (z !== undefined) item.target.z = z;
  } else Object.assign(item, patch);
  syncRoute(next);
  return next;
}
export function removeEntity(map: MapFile, s: Selection): MapFile {
  const item = entity(map, s);
  if (
    !item ||
    ["spawn", "exit"].includes(s.kind) ||
    (s.kind === "route" && item.kind === "exit")
  )
    return map;
  const next = structuredClone(map);
  const c = container(next, s.kind),
    v = c[s.kind];
  if (Array.isArray(v)) v.splice(s.index, 1);
  else delete c[s.kind];
  const referenceKind =
    s.kind === "keys"
      ? "key"
      : s.kind === "checkpoints"
        ? "rack"
        : s.kind === "platforms"
          ? "ferry"
          : s.kind === "crossing"
            ? "bridge"
            : null;
  next.route = next.route.filter(
    (r) =>
      !(
        r.kind === referenceKind &&
        (s.kind === "crossing" || r.id === s.index)
      ),
  );
  next.route.forEach((r) => {
    if (r.kind === referenceKind && r.id !== undefined && r.id > s.index)
      r.id--;
    if (s.kind === "keys" && r.requiredKey !== undefined) {
      if (r.requiredKey === s.index) delete r.requiredKey;
      else if (r.requiredKey > s.index) r.requiredKey--;
    }
  });
  if (!next.level.pads.length) {
    delete next.level.gate;
    next.route = next.route.filter((r) => r.kind !== "pads");
  }
  syncRoute(next);
  return next;
}
export function addEntity(
  map: MapFile,
  tool: Tool,
  point: Point,
): { map: MapFile; selection: Selection } {
  if (
    tool === "select" ||
    tool === "pan" ||
    !(Object.hasOwn(entityNames, tool) || tool === "moving" || tool === "wall")
  )
    throw new Error("请先选择要添加的物件。");
  if (tool === "crossing" && map.crossing)
    throw new Error("每张地图只能放置一处纸桥断口。");
  const next = structuredClone(map),
    p = { ...point };
  const kind: EntityKind =
    tool === "moving" || tool === "wall" ? "platforms" : (tool as EntityKind);
  let data: any = { ...p };
  if (kind === "platforms") {
    data = {
      ...p,
      w: tool === "wall" ? 0.5 : 4,
      d: 3,
      h: tool === "wall" ? 4 : 1,
    };
    if (tool === "moving")
      Object.assign(data, {
        w: 2.4,
        kind: "moving",
        motion: defaultMotion(),
      });
    if (tool === "wall") Object.assign(data, { y: p.y + 4, kind: "wall" });
  }
  if (kind === "keys" || kind === "stars") data.y += 0.7;
  if (kind === "signs") data.text = "在这里写提示";
  if (kind === "hazards") Object.assign(data, { w: 1, d: 2.8 });
  if (kind === "winds") Object.assign(data, { w: 3, d: 3, height: 5 });
  if (kind === "awnings")
    Object.assign(data, { y: p.y + 3.4, floor: p.y, w: 3.4, d: 3.6 });
  if (kind === "zones") {
    data = { x: p.x, z: p.z, w: 10, d: 5, rate: 18 };
  }
  if (kind === "gate") {
    Object.assign(data, { y: p.y + 3.8, w: 0.4, d: 3, h: 3.8, kind: "wall" });
    if (!next.level.pads.length)
      next.level.pads.push({ ...p, x: p.x - 3 }, { ...p, x: p.x - 6 });
  }
  if (kind === "route") data = { kind: "walk", target: p, view: 0 };
  if (kind === "crossing") {
    data = { ...p, axis: "x", near: -1, span: 2.6, depth: 3 };
    const platform = (
      x: number,
      z: number,
      w: number,
      d: number,
      y = p.y,
      h = 1,
    ) => ({ x, z, w, d, y, h });
    next.level.platforms.push(
      platform(p.x - 3.3, p.z, 4, 3),
      platform(p.x + 3.3, p.z, 4, 3),
      { ...platform(p.x, p.z, 8.8, 3.4, p.y + 12, 10.99), kind: "low-roof" },
      { ...platform(p.x, p.z - 1.7, 8.8, 0.2, p.y + 12, 12), kind: "railing" },
      { ...platform(p.x, p.z + 1.7, 8.8, 0.2, p.y + 12, 12), kind: "railing" },
    );
    next.route.splice(Math.max(0, next.route.length - 1), 0, {
      kind: "bridge",
      target: { ...p, x: p.x + 1.8 },
      view: 0,
    });
  }
  const c = container(next, kind),
    v = c[kind];
  let index = 0;
  if (Array.isArray(v)) {
    index = kind === "route" ? Math.max(0, v.length - 1) : v.length;
    v.splice(index, 0, data);
  } else c[kind] = data;
  if (kind === "keys" || kind === "checkpoints")
    next.route.splice(Math.max(0, next.route.length - 1), 0, {
      kind: kind === "keys" ? "key" : "rack",
      target: p,
      view: 0,
      id: index,
    });
  syncRoute(next);
  checkCapacity(map, next);
  return { map: next, selection: { kind, index } };
}
export function duplicateEntity(map: MapFile, s: Selection) {
  if (
    !entity(map, s) ||
    ["spawn", "exit", "gate", "crossing", "route"].includes(s.kind)
  )
    return { map, selection: s };
  const next = structuredClone(map),
    list = container(next, s.kind)[s.kind],
    data = structuredClone(list[s.index]);
  data.x += 1;
  list.push(data);
  const index = list.length - 1;
  if (s.kind === "keys" || s.kind === "checkpoints")
    next.route.splice(next.route.length - 1, 0, {
      kind: s.kind === "keys" ? "key" : "rack",
      id: index,
      target: { ...data },
      view: 0,
    });
  syncRoute(next);
  checkCapacity(map, next);
  return { map: next, selection: { kind: s.kind, index } };
}

function checkCapacity(before: MapFile, after: MapFile) {
  for (const [kind, limit] of Object.entries(MAP_LIMITS)) {
    const key = kind as EntityKind;
    const count = container(after, key)[key].length;
    if (count > limit && count > container(before, key)[key].length)
      throw new Error(
        `${entityNames[key]}最多 ${limit} 个；本次操作未修改地图。`,
      );
  }
}
