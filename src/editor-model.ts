import { MAP_LIMITS, type MapFile } from "./map-format";
import type { Platform, Point } from "./game";
import { bankPoint } from "./bridges";
const defaultMotion = (): NonNullable<Platform["motion"]> => ({
  axis: "x",
  range: 2.2,
  period: 6,
});

export type PlatformStyle = "normal" | NonNullable<Platform["kind"]>;
export function platformStylePatch(
  platform: Platform,
  kind: PlatformStyle,
): Partial<Platform> {
  return {
    kind: kind === "normal" ? undefined : kind,
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

export interface EntityData {
  platforms: MapFile["level"]["platforms"][number];
  keys: Point;
  stars: Point;
  checkpoints: MapFile["level"]["checkpoints"][number];
  signs: MapFile["level"]["signs"][number];
  pads: Point;
  winds: MapFile["level"]["winds"][number];
  hazards: MapFile["level"]["hazards"][number];
  awnings: MapFile["weather"]["awnings"][number];
  zones: MapFile["weather"]["zones"][number];
  route: MapFile["route"][number];
  spawn: Point;
  exit: Point;
  gate: NonNullable<MapFile["level"]["gate"]>;
  crossing: NonNullable<MapFile["crossing"]>;
}
export type EntityKind = keyof EntityData;
export interface Selection<K extends EntityKind = EntityKind> {
  kind: K;
  index: number;
}
export type EditorEntity = {
  [K in EntityKind]: Selection<K> & { data: EntityData[K] };
}[EntityKind];
export type EntityPatch<K extends EntityKind> = Partial<
  K extends "route" ? EntityData[K] & Point : EntityData[K]
>;
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
function lists(map: MapFile) {
  return {
    platforms: map.level.platforms,
    keys: map.level.keys,
    stars: map.level.stars,
    checkpoints: map.level.checkpoints,
    signs: map.level.signs,
    pads: map.level.pads,
    winds: map.level.winds,
    hazards: map.level.hazards,
    awnings: map.weather.awnings,
    zones: map.weather.zones,
    route: map.route,
  };
}
export function entities(map: MapFile): EditorEntity[] {
  const result: EditorEntity[] = [],
    collections = lists(map);
  for (const kind of Object.keys(entityNames) as EntityKind[]) {
    const count =
      kind === "spawn" ||
      kind === "exit" ||
      kind === "gate" ||
      kind === "crossing"
        ? 1
        : collections[kind].length;
    for (let index = 0; index < count; index++) {
      const selected = entity(map, { kind, index });
      if (selected) result.push(selected);
    }
  }
  return result;
}
export function entity(
  map: MapFile,
  selection: Selection,
): EditorEntity | undefined {
  const { kind, index } = selection;
  if (!Number.isInteger(index) || index < 0) return undefined;
  switch (kind) {
    case "platforms": {
      const data = map.level.platforms[index];
      return data && { kind, index, data };
    }
    case "keys": {
      const data = map.level.keys[index];
      return data && { kind, index, data };
    }
    case "stars": {
      const data = map.level.stars[index];
      return data && { kind, index, data };
    }
    case "checkpoints": {
      const data = map.level.checkpoints[index];
      return data && { kind, index, data };
    }
    case "signs": {
      const data = map.level.signs[index];
      return data && { kind, index, data };
    }
    case "pads": {
      const data = map.level.pads[index];
      return data && { kind, index, data };
    }
    case "winds": {
      const data = map.level.winds[index];
      return data && { kind, index, data };
    }
    case "hazards": {
      const data = map.level.hazards[index];
      return data && { kind, index, data };
    }
    case "awnings": {
      const data = map.weather.awnings[index];
      return data && { kind, index, data };
    }
    case "zones": {
      const data = map.weather.zones[index];
      return data && { kind, index, data };
    }
    case "route": {
      const data = map.route[index];
      return data && { kind, index, data };
    }
    case "spawn":
      return index === 0 ? { kind, index, data: map.level.spawn } : undefined;
    case "exit":
      return index === 0 ? { kind, index, data: map.level.exit } : undefined;
    case "gate":
      return index === 0 && map.level.gate
        ? { kind, index, data: map.level.gate }
        : undefined;
    case "crossing":
      return index === 0 && map.crossing
        ? { kind, index, data: map.crossing }
        : undefined;
  }
}
export function pointOf(data: EntityData[EntityKind]): Point {
  return "target" in data
    ? data.target
    : { x: data.x, y: "y" in data ? data.y : 0, z: data.z };
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
export function editEntity<K extends EntityKind>(
  map: MapFile,
  selection: Selection<K>,
  patch: EntityPatch<NoInfer<K>>,
): MapFile;
export function editEntity(
  map: MapFile,
  selection: Selection,
  patch: EntityPatch<EntityKind> & Partial<Point>,
): MapFile {
  const next = structuredClone(map),
    selected = entity(next, selection);
  if (!selected) return map;
  if (selected.kind === "route") {
    const item = selected.data;
    const { x, y, z, ...rest } = patch;
    // The terminal route step is structural; changing its kind would recreate it.
    if (
      item.kind === "exit" &&
      "kind" in rest &&
      rest.kind &&
      rest.kind !== "exit"
    )
      return map;
    Object.assign(item, rest);
    if (!["key", "rack", "ferry"].includes(item.kind)) delete item.id;
    if (item.kind !== "ferry") {
      delete item.requiredKey;
      delete item.landingId;
    }
    if (item.kind !== "wind") delete item.from;
    if (item.kind !== "jump") delete item.via;
    if (x !== undefined) item.target.x = x;
    if (y !== undefined) item.target.y = y;
    if (z !== undefined) item.target.z = z;
  } else {
    const stoppedFerry =
      selected.kind === "platforms" &&
      selected.data.motion &&
      "motion" in patch &&
      !patch.motion;
    Object.assign(selected.data, patch);
    if (stoppedFerry)
      next.route = next.route.filter(
        (r) =>
          r.kind !== "ferry" ||
          (r.id !== selection.index && r.landingId !== selection.index),
      );
  }
  syncRoute(next);
  return next;
}
/** Dragging changes coordinates only, regardless of the selected object's other fields. */
export function moveEntity(
  map: MapFile,
  selection: Selection,
  point: Point,
): MapFile {
  const next = structuredClone(map),
    selected = entity(next, selection);
  if (!selected) return map;
  if (selected.kind === "route") Object.assign(selected.data.target, point);
  else if (selected.kind === "zones") {
    selected.data.x = point.x;
    selected.data.z = point.z;
  } else Object.assign(selected.data, point);
  syncRoute(next);
  return next;
}
export function removeEntity(map: MapFile, s: Selection): MapFile {
  const item = entity(map, s);
  if (
    !item ||
    ["spawn", "exit"].includes(s.kind) ||
    (item.kind === "route" && item.data.kind === "exit")
  )
    return map;
  const next = structuredClone(map);
  if (s.kind === "crossing") delete next.crossing;
  else if (s.kind === "gate") delete next.level.gate;
  else if (s.kind !== "spawn" && s.kind !== "exit")
    lists(next)[s.kind].splice(s.index, 1);
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
      ) && !(s.kind === "platforms" && r.landingId === s.index),
  );
  next.route.forEach((r) => {
    if (r.kind === referenceKind && r.id !== undefined && r.id > s.index)
      r.id--;
    if (
      s.kind === "platforms" &&
      r.landingId !== undefined &&
      r.landingId > s.index
    )
      r.landingId--;
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
  if (tool === "select" || tool === "pan")
    throw new Error("请先选择要添加的物件。");
  if (tool === "crossing" && map.crossing)
    throw new Error("每张地图只能放置一处纸桥断口。");
  const next = structuredClone(map),
    p = { ...point };
  const kind: EntityKind =
    tool === "moving" || tool === "wall" ? "platforms" : tool;
  let index = 0;
  const append = <T>(list: T[], data: T) => {
    index = list.length;
    list.push(data);
  };
  switch (tool) {
    case "platforms":
      append(next.level.platforms, { ...p, w: 4, d: 3, h: 1 });
      break;
    case "wall":
      append(next.level.platforms, {
        ...p,
        y: p.y + 4,
        w: 0.5,
        d: 3,
        h: 4,
        kind: "wall",
      });
      break;
    case "moving":
      append(next.level.platforms, {
        ...p,
        w: 2.4,
        d: 3,
        h: 1,
        kind: "moving",
        motion: defaultMotion(),
      });
      break;
    case "keys":
      append(next.level.keys, { ...p, y: p.y + 0.7 });
      break;
    case "stars":
      append(next.level.stars, { ...p, y: p.y + 0.7 });
      break;
    case "checkpoints":
      append(next.level.checkpoints, p);
      break;
    case "signs":
      append(next.level.signs, { ...p, text: "在这里写提示" });
      break;
    case "pads":
      append(next.level.pads, p);
      break;
    case "hazards":
      append(next.level.hazards, { ...p, w: 1, d: 2.8 });
      break;
    case "winds":
      append(next.level.winds, { ...p, w: 3, d: 3, height: 5 });
      break;
    case "awnings":
      append(next.weather.awnings, {
        ...p,
        y: p.y + 3.4,
        floor: p.y,
        w: 3.4,
        d: 3.6,
      });
      break;
    case "zones":
      append(next.weather.zones, { x: p.x, z: p.z, w: 10, d: 5, rate: 18 });
      break;
    case "spawn":
      next.level.spawn = p;
      break;
    case "exit":
      next.level.exit = p;
      break;
    case "gate":
      next.level.gate = {
        ...p,
        y: p.y + 3.8,
        w: 0.4,
        d: 3,
        h: 3.8,
        kind: "wall",
      };
      if (!next.level.pads.length)
        next.level.pads.push({ ...p, x: p.x - 3 }, { ...p, x: p.x - 6 });
      break;
    case "route":
      index = Math.max(0, next.route.length - 1);
      next.route.splice(index, 0, { kind: "walk", target: p, view: 0 });
      break;
    case "crossing": {
      next.crossing = { ...p, axis: "x", near: -1, span: 2.6, depth: 3 };
      const platform = (
        x: number,
        z: number,
        w: number,
        d: number,
        y = p.y,
        h = 1,
      ): Platform => ({ x, z, w, d, y, h });
      next.level.platforms.push(
        platform(p.x - 3.3, p.z, 4, 3),
        platform(p.x + 3.3, p.z, 4, 3),
        { ...platform(p.x, p.z, 8.8, 3.4, p.y + 12, 10.99), kind: "low-roof" },
        {
          ...platform(p.x, p.z - 1.7, 8.8, 0.2, p.y + 12, 12),
          kind: "railing",
        },
        {
          ...platform(p.x, p.z + 1.7, 8.8, 0.2, p.y + 12, 12),
          kind: "railing",
        },
      );
      next.route.splice(Math.max(0, next.route.length - 1), 0, {
        kind: "bridge",
        target: { ...p, x: p.x + 1.8 },
        view: 0,
      });
      break;
    }
  }
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
export function duplicateEntity(map: MapFile, selection: Selection) {
  const original = entity(map, selection);
  if (
    !original ||
    original.kind === "spawn" ||
    original.kind === "exit" ||
    original.kind === "gate" ||
    original.kind === "crossing" ||
    original.kind === "route"
  )
    return { map, selection };
  const next = structuredClone(map);
  const duplicate = <T extends { x: number }>(list: T[]) => {
    const data = structuredClone(list[selection.index]);
    data.x += 1;
    list.push(data);
    return { data, index: list.length - 1 };
  };
  let result: { data: EntityData[Exclude<EntityKind, "route">]; index: number };
  switch (original.kind) {
    case "platforms":
      result = duplicate(next.level.platforms);
      break;
    case "keys":
      result = duplicate(next.level.keys);
      break;
    case "stars":
      result = duplicate(next.level.stars);
      break;
    case "checkpoints":
      result = duplicate(next.level.checkpoints);
      break;
    case "signs":
      result = duplicate(next.level.signs);
      break;
    case "pads":
      result = duplicate(next.level.pads);
      break;
    case "winds":
      result = duplicate(next.level.winds);
      break;
    case "hazards":
      result = duplicate(next.level.hazards);
      break;
    case "awnings":
      result = duplicate(next.weather.awnings);
      break;
    case "zones":
      result = duplicate(next.weather.zones);
      break;
  }
  if (original.kind === "keys" || original.kind === "checkpoints")
    next.route.splice(next.route.length - 1, 0, {
      kind: original.kind === "keys" ? "key" : "rack",
      id: result.index,
      target: pointOf(result.data),
      view: 0,
    });
  syncRoute(next);
  checkCapacity(map, next);
  return { map: next, selection: { kind: original.kind, index: result.index } };
}
function checkCapacity(before: MapFile, after: MapFile) {
  const previous = lists(before),
    current = lists(after);
  for (const key of Object.keys(MAP_LIMITS) as (keyof typeof MAP_LIMITS)[]) {
    const limit = MAP_LIMITS[key],
      count = current[key].length;
    if (count > limit && count > previous[key].length)
      throw new Error(
        `${entityNames[key]}最多 ${limit} 个；本次操作未修改地图。`,
      );
  }
}
