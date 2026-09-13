import type { Level, Point } from "./game";
import type { Weather } from "./weather";
import type { BridgeCrossing } from "./bridges";
import type { RouteStep } from "./guide";
import {
  MAX_PLATFORM_SPAN,
  MIN_INTERACTIVE_CHAPTER,
  interactiveModules,
  oversizedGroundRuns,
} from "./map-rules";

/** The file consumed by the campaign and exported by the standalone editor. */
export interface MapFile {
  format: "before-the-rain-map";
  version: 1;
  /** One-based intended campaign position; registration also checks its real slot. */
  chapter?: number;
  level: Level;
  weather: Weather;
  crossing?: BridgeCrossing;
  route: RouteStep[];
  translations?: Record<string, string>;
}
export interface MapReport {
  errors: string[];
  warnings: string[];
}
export const MAP_LIMITS = {
  platforms: 180,
  keys: 80,
  stars: 80,
  pads: 2,
  checkpoints: 80,
  signs: 80,
  winds: 24,
  hazards: 60,
  zones: 24,
  awnings: 30,
  route: 180,
} as const;
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validateMap(
  value: unknown,
  campaignChapter?: number,
): MapReport {
  const errors: string[] = [],
    warnings: string[] = [];
  const fail = (path: string, message: string) =>
    errors.push(`${path}：${message}`);
  const num = (v: unknown, path: string, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      fail(path, `需要 ${min}–${max} 之间的数字`);
  };
  const str = (v: unknown, path: string, max = 180) => {
    if (typeof v !== "string" || v.length > max)
      fail(path, `需要不超过 ${max} 字的文字`);
  };
  const point = (v: unknown, path: string) => {
    if (!object(v)) {
      fail(path, "缺少坐标");
      return;
    }
    num(v.x, path + ".x", -72, 72);
    num(v.z, path + ".z", -42, 42);
    num(v.y, path + ".y", -4, 24);
  };
  const size = (v: Record<string, any>, path: string) => {
    num(v.w, path + ".w", 0.1, 72);
    num(v.d, path + ".d", 0.1, 72);
  };
  const platform = (v: unknown, path: string) => {
    point(v, path);
    if (!object(v)) return;
    num(v.w, path + ".w", 0.1, MAX_PLATFORM_SPAN);
    num(v.d, path + ".d", 0.1, MAX_PLATFORM_SPAN);
    num(v.h, path + ".h", 0.1, 30);
    if (
      v.kind !== undefined &&
      !["wall", "step", "moving", "low-roof", "railing"].includes(v.kind)
    )
      fail(path, "未知平台种类");
    if (v.motion !== undefined) {
      if (!object(v.motion)) fail(path + ".motion", "需要移动参数");
      else {
        if (!["x", "z"].includes(v.motion.axis))
          fail(path, "移动轴只能是 x 或 z");
        num(v.motion.range, path + ".motion.range", 0.1, 20);
        num(v.motion.period, path + ".motion.period", 1, 60);
      }
    }
  };
  const list = (
    v: unknown,
    path: string,
    max: number,
    check: (x: unknown, p: string) => void,
  ) => {
    if (!Array.isArray(v)) {
      fail(path, "需要数组");
      return;
    }
    if (v.length > max) fail(path, `最多 ${max} 项`);
    v.slice(0, max).forEach((x, i) => check(x, `${path}[${i}]`));
  };
  if (!object(value)) return { errors: ["地图必须是 JSON 对象"], warnings };
  if (value.format !== "before-the-rain-map" || value.version !== 1)
    fail("version", "需要 before-the-rain-map 第 1 版格式");
  if (
    value.chapter !== undefined &&
    (!Number.isInteger(value.chapter) ||
      value.chapter < 1 ||
      value.chapter > 999)
  )
    fail("chapter", "目标关卡需要 1–999 之间的整数");
  if (
    campaignChapter !== undefined &&
    value.chapter !== undefined &&
    campaignChapter !== value.chapter
  )
    fail("chapter", `目标关卡与实际注册的第 ${campaignChapter} 关不一致`);
  const l = value.level,
    w = value.weather;
  if (!object(l) || !object(w))
    return { errors: [...errors, "缺少 level 或 weather"], warnings };
  for (const k of ["name", "sub", "hint"]) str(l[k], `level.${k}`);
  if (typeof l.name !== "string" || !l.name.trim())
    fail("level.name", "名称不能为空");
  for (const k of ["color", "sky"])
    if (typeof l[k] !== "string" || !/^#[\da-f]{6}$/i.test(l[k]))
      fail(`level.${k}`, "需要 #RRGGBB 颜色");
  point(l.spawn, "spawn");
  point(l.exit, "exit");
  list(l.platforms, "platforms", MAP_LIMITS.platforms, platform);
  for (const key of ["keys", "stars", "pads", "checkpoints", "signs"])
    list(l[key], key, MAP_LIMITS[key as keyof typeof MAP_LIMITS], (v, path) => {
      point(v, path);
      if (!object(v)) return;
      if (v.text !== undefined) str(v.text, path + ".text", 100);
      if (v.view !== undefined && ![0, 1].includes(v.view))
        fail(path, "视角只能是 0 或 1");
    });
  if (l.gate !== undefined) {
    platform(l.gate, "gate");
    if (!l.pads?.length) fail("pads", "门需要至少一个开门踏板");
  }
  list(l.winds, "winds", MAP_LIMITS.winds, (v, path) => {
    point(v, path);
    if (object(v)) {
      size(v, path);
      num(v.height, path + ".height", 0.5, 20);
    }
  });
  list(l.hazards, "hazards", MAP_LIMITS.hazards, (v, path) => {
    point(v, path);
    if (object(v)) {
      size(v, path);
      if (v.period !== undefined) num(v.period, path + ".period", 1, 30);
    }
  });
  num(w.period, "weather.period", 2, 60);
  list(w.zones, "weather.zones", MAP_LIMITS.zones, (v, path) => {
    if (!object(v)) {
      fail(path, "需要雨区对象");
      return;
    }
    point({ ...v, y: 0 }, path);
    size(v, path);
    num(v.rate, path + ".rate", 0, 50);
  });
  list(w.awnings, "weather.awnings", MAP_LIMITS.awnings, (v, path) => {
    point(v, path);
    if (object(v)) {
      size(v, path);
      if (v.floor !== undefined) num(v.floor, path + ".floor", -4, 20);
    }
  });
  if (value.crossing !== undefined) {
    const c = value.crossing;
    point(c, "crossing");
    if (object(c)) {
      if (!["x", "z"].includes(c.axis) || ![-1, 1].includes(c.near))
        fail("crossing", "检查方向与起始岸");
      num(c.span, "crossing.span", 0.5, 2.8);
      num(c.depth, "crossing.depth", 1, 5);
    }
  }
  list(value.route, "route", MAP_LIMITS.route, (v, path) => {
    if (!object(v)) {
      fail(path, "需要引导点");
      return;
    }
    point(v.target, path + ".target");
    if (
      ![
        "walk",
        "jump",
        "rack",
        "key",
        "bridge",
        "wind",
        "ferry",
        "pads",
        "exit",
      ].includes(v.kind)
    )
      fail(path, "未知引导种类");
    if (![0, 1].includes(v.view)) fail(path, "需要视角 0 或 1");
    const ref =
      v.kind === "key"
        ? l.keys
        : v.kind === "rack"
          ? l.checkpoints
          : v.kind === "ferry"
            ? l.platforms
            : null;
    if (ref && (!Number.isInteger(v.id) || !ref[v.id]))
      fail(path + ".id", "引用对象不存在（编号从 0 开始）");
    if (
      v.kind === "ferry" &&
      Number.isInteger(v.id) &&
      !l.platforms?.[v.id]?.motion
    )
      fail(path, "渡台引导必须引用移动平台");
    if (v.kind === "wind") point(v.from, path + ".from");
    if (v.kind === "bridge" && !value.crossing) fail(path, "没有纸桥断口");
    if (v.kind === "pads" && !l.pads?.length) fail(path, "没有开门踏板");
    if (
      v.requiredKey !== undefined &&
      (!Number.isInteger(v.requiredKey) || !l.keys?.[v.requiredKey])
    )
      fail(path, "渡台钥匙引用不存在");
  });
  if (
    !Array.isArray(value.route) ||
    !value.route.length ||
    value.route.at(-1)?.kind !== "exit"
  )
    fail("route", "最后一个引导点必须是终点 exit");
  if (
    Array.isArray(value.route) &&
    value.route.slice(0, -1).some((r) => r?.kind === "exit")
  )
    fail("route", "终点引导只能出现一次，并且必须放在最后");
  if (value.translations !== undefined) {
    if (
      !object(value.translations) ||
      Object.keys(value.translations).length > 160
    )
      fail("translations", "翻译表最多 160 项");
    else
      Object.entries(value.translations).forEach(([k, v]) => {
        str(k, "translations.key");
        str(v, "translations.value", 300);
      });
  }
  if (errors.length) return { errors, warnings };
  const m = value as MapFile;
  for (const run of oversizedGroundRuns(m.level.platforms))
    fail(
      `platforms[${run.platforms.join(",")}]`,
      `同高连续地面沿 ${run.axis.toUpperCase()} 长 ${(run.end - run.start).toFixed(2)}，不能超过 ${MAX_PLATFORM_SPAN}；请加入可跳断口或转折（小于 0.8 的接缝仍计为连续地面）`,
    );
  const chapter = campaignChapter ?? m.chapter;
  if (chapter !== undefined && chapter >= MIN_INTERACTIVE_CHAPTER) {
    const count = interactiveModules(m).length;
    if (count < 2)
      fail(
        "route",
        `第 ${chapter} 关至少需要 2 个路线中使用的独立互动模块，当前 ${count} 个（渡舟、风柱、纸桥或石踏板门；可以同类型）`,
      );
  }
  const supported = (q: Point) =>
    m.level.platforms.some(
      (p) =>
        !p.motion &&
        Math.abs(p.y - q.y) < 0.12 &&
        Math.abs(q.x - p.x) <= p.w / 2 &&
        Math.abs(q.z - p.z) <= p.d / 2,
    );
  for (const [name, q] of [
    ["起点", l.spawn],
    ["终点", l.exit],
    ...l.checkpoints.map((q: Point, i: number) => [`存档点 ${i + 1}`, q]),
  ] as [string, Point][])
    if (!supported(q))
      warnings.push(`${name} 下方没有同高的固定平台，请试玩检查落点。`);
  if (!m.level.platforms.length) warnings.push("地图还没有平台。");
  m.level.platforms.forEach((p, i) => {
    if (p.kind === "moving" && !p.motion)
      warnings.push(
        `平台 ${i + 1} 标为渡台，但未开启往返移动。选中它并勾选「开启往返移动（渡台）」。`,
      );
  });
  m.level.keys.forEach((_, i) => {
    if (
      !m.route.some(
        (r) => (r.kind === "key" && r.id === i) || r.requiredKey === i,
      )
    )
      warnings.push(`钥匙 ${i + 1} 未加入引导路线。`);
  });
  if (m.crossing && !m.level.platforms.some((p) => p.kind === "low-roof"))
    warnings.push(
      "纸桥断口没有低檐，可能被直接跳过。可使用纸桥组件自动添加两岸和低檐。",
    );
  if (!supported({ ...m.level.spawn, x: m.level.spawn.x + 3.75 }))
    warnings.push("起点右侧需容纳 6 人；目前末位纸鹤可能没有落脚平台。");
  return { errors, warnings };
}
export function parseMap(value: unknown, campaignChapter?: number): MapFile {
  const report = validateMap(value, campaignChapter);
  if (report.errors.length) throw new Error(report.errors.join("\n"));
  // Validation covers schema fields only. Never let unknown target/motion
  // properties reach the editor's generic inspector or coordinate helpers.
  const m = value as MapFile;
  const pick = <T extends object, K extends keyof T>(
    v: T,
    keys: readonly K[],
  ): Pick<T, K> =>
    Object.fromEntries(
      keys.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]),
    ) as Pick<T, K>;
  const point = (v: Point) => pick(v, ["x", "y", "z"]);
  const platform = (v: MapFile["level"]["platforms"][number]) => ({
    ...point(v),
    ...pick(v, ["w", "d", "h", "kind"]),
    ...(v.motion
      ? { motion: pick(v.motion, ["axis", "range", "period"]) }
      : {}),
  });
  const marker = (v: MapFile["level"]["signs"][number]) => ({
    ...point(v),
    ...pick(v, ["text", "view"]),
  });
  return {
    format: m.format,
    version: m.version,
    ...(m.chapter !== undefined ? { chapter: m.chapter } : {}),
    level: {
      ...pick(m.level, ["name", "sub", "hint", "color", "sky"]),
      spawn: point(m.level.spawn),
      exit: point(m.level.exit),
      platforms: m.level.platforms.map(platform),
      keys: m.level.keys.map(point),
      stars: m.level.stars.map(point),
      pads: m.level.pads.map(point),
      checkpoints: m.level.checkpoints.map(marker),
      signs: m.level.signs.map(marker),
      winds: m.level.winds.map((v) => ({
        ...point(v),
        ...pick(v, ["w", "d", "height"]),
      })),
      hazards: m.level.hazards.map((v) => ({
        ...point(v),
        ...pick(v, ["w", "d", "period"]),
      })),
      ...(m.level.gate ? { gate: platform(m.level.gate) } : {}),
    },
    weather: {
      period: m.weather.period,
      zones: m.weather.zones.map((v) => pick(v, ["x", "z", "w", "d", "rate"])),
      awnings: m.weather.awnings.map((v) => ({
        ...point(v),
        ...pick(v, ["w", "d", "floor"]),
      })),
    },
    ...(m.crossing
      ? {
          crossing: {
            ...point(m.crossing),
            ...pick(m.crossing, ["axis", "near", "span", "depth"]),
          },
        }
      : {}),
    route: m.route.map((v) => ({
      kind: v.kind,
      view: v.view,
      target: point(v.target),
      ...(["key", "rack", "ferry"].includes(v.kind) ? pick(v, ["id"]) : {}),
      ...(v.kind === "ferry" ? pick(v, ["requiredKey"]) : {}),
      ...(v.kind === "wind" && v.from ? { from: point(v.from) } : {}),
    })),
    ...(m.translations ? { translations: { ...m.translations } } : {}),
  } as MapFile;
}
export function serializeMap(map: MapFile) {
  return JSON.stringify(parseMap(map), null, 2) + "\n";
}
export function starterMap(): MapFile {
  return {
    format: "before-the-rain-map",
    version: 1,
    chapter: 1,
    level: {
      name: "我的雨中小径",
      sub: "从一张纸开始。",
      hint: "左右移动 · 空格跳跃 · Q 转面",
      color: "#53697b",
      sky: "#28394b",
      spawn: { x: -1, y: 0, z: 0 },
      exit: { x: 5, y: 0, z: 0 },
      platforms: [{ x: 1, y: 0, z: 0, w: 9, d: 4, h: 1 }],
      keys: [],
      stars: [],
      checkpoints: [],
      signs: [],
      pads: [],
      winds: [],
      hazards: [],
    },
    weather: {
      period: 10,
      zones: [],
      awnings: [{ x: 0.5, y: 3.4, z: 0, w: 7, d: 3.8 }],
    },
    route: [{ kind: "exit", target: { x: 5, y: 0, z: 0 }, view: 0 }],
  };
}
