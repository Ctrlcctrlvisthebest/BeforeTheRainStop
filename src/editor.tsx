import { interactiveModules } from "./map-rules";
import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { LEVELS, type Point } from "./game";
import { WEATHER } from "./weather";
import { CROSSINGS, bankPoint } from "./bridges";
import { GUIDE_ROUTES } from "./guide";
import { translate } from "./i18n";
import {
  parseMap,
  serializeMap,
  starterMap,
  validateMap,
  type MapFile,
} from "./map-format";
import {
  addEntity,
  duplicateEntity,
  editEntity,
  entities,
  entity,
  entityNames,
  pointOf,
  removeEntity,
  syncRoute,
  platformStylePatch,
  platformMotionPatch,
  type EntityKind,
  type Selection,
  type Tool,
} from "./editor-model";
import {
  EditorHelp,
  EditorWalkthrough,
  MotionPreview,
  PLATFORM_HELP,
  TOOL_HELP,
  type HelpTopic,
  type WalkthroughAction,
} from "./editor-help";
import "./editor.css";
const MapPreview = lazy(() => import("./editor-preview"));
const DRAFT = "rain-map-editor-v1";
const GUIDE_PREF = "rain-map-editor-guide-v1";
const templates = LEVELS.map((level, i): MapFile => ({
  format: "before-the-rain-map",
  version: 1,
  chapter: i + 1,
  level,
  weather: WEATHER[i],
  ...(CROSSINGS[i] ? { crossing: CROSSINGS[i] } : {}),
  route: GUIDE_ROUTES[i],
  translations: Object.fromEntries(
    [
      level.name,
      level.sub,
      level.hint,
      ...level.signs.map((s) => s.text ?? ""),
    ].map((s) => [s, translate("en", s)]),
  ),
}));
const palette: [Tool, string, string][] = [
  ["platforms", "▰ 平台", "固定落脚平台"],
  [
    "moving",
    "↔ 渡台（移动平台）",
    "已开启往返运动的平台，可调整方向、距离与周期",
  ],
  ["wall", "▥ 墙体", "阻挡路线的实体墙"],
  ["keys", "⚿ 钥匙", "全部收齐才能通关"],
  ["stars", "✦ 星星", "可选的额外挑战"],
  ["checkpoints", "⚑ 许愿架", "自动存档；F 修补"],
  ["awnings", "⌂ 篷子 + 小火", "篷子挡雨，靠近小火烤干"],
  ["hazards", "♨ 旺火", "碰到失败；可设熄火周期"],
  ["winds", "↑ 风柱", "把纸鹤托向高台"],
  ["zones", "☂ 雨区", "调整覆盖范围与雨量"],
  ["crossing", "⇥ 纸桥组件", "自动放置两岸、低檐、侧栏与断口，每图一处"],
  ["pads", "▣ 开门踏板", "带门形标记的石踏板，站住四秒开门，每图最多两块"],
  ["gate", "▥ 机关门", "添加机关门；无开门踏板时一并添加"],
  ["signs", "▧ 路牌", "写下玩家能看懂的提示"],
  ["route", "◇ 引导点", "按顺序引导走、跳、转面"],
  ["spawn", "● 起点", "六人会向右依次站开"],
  ["exit", "◈ 终点", "全员到达才能通关"],
];
const colors: Record<EntityKind, string> = {
  platforms: "#718b9b",
  keys: "#f0c269",
  stars: "#eedcac",
  checkpoints: "#be9569",
  signs: "#c1b396",
  pads: "#d4aa75",
  winds: "#9abbc9",
  hazards: "#cf7459",
  awnings: "#ad9171",
  zones: "#7799b5",
  route: "#f4d8a3",
  spawn: "#b9d1bd",
  exit: "#e5a663",
  gate: "#a36e59",
  crossing: "#f2bb83",
};
function initialMap() {
  try {
    const text = localStorage.getItem(DRAFT);
    if (text) return parseMap(JSON.parse(text));
  } catch {}
  return starterMap();
}
function App() {
  const [history, setHistory] = useState<{
    past: MapFile[];
    map: MapFile;
    future: MapFile[];
  }>(() => ({ past: [], map: initialMap(), future: [] }));
  const map = history.map;
  const [selection, setSelection] = useState<Selection | null>(null),
    [tool, setTool] = useState<Tool>("select"),
    [view, setView] = useState<"top" | "front" | "side">("top");
  const [center, setCenter] = useState({ u: 10, v: 0 }),
    [span, setSpan] = useState(48),
    [layer, setLayer] = useState(0),
    [slice, setSlice] = useState(0),
    [snap, setSnap] = useState(0.5),
    [template, setTemplate] = useState(0),
    [notice, setNotice] = useState(
      "草稿只保存在当前浏览器。导出 JSON 可留存或分享。",
    ),
    [saved, setSaved] = useState(true),
    [preview, setPreview] = useState<MapFile | null>(null),
    [dragMap, setDragMap] = useState<MapFile | null>(null),
    [help, setHelp] = useState<HelpTopic | null>(null),
    [walkthrough, setWalkthrough] = useState(() => {
      try {
        return localStorage.getItem(GUIDE_PREF) !== "collapsed";
      } catch {
        return true;
      }
    });
  const svg = useRef<SVGSVGElement>(null),
    file = useRef<HTMLInputElement>(null),
    drag = useRef<any>(null),
    latestDrag = useRef<MapFile | null>(null);
  const display = dragMap ?? map,
    report = useMemo(() => validateMap(map), [map]),
    all = entities(display),
    item = selection ? entity(display, selection) : null;
  const commit = useCallback((next: MapFile) => {
    setHistory((h) => ({
      past: [...h.past, h.map].slice(-80),
      map: next,
      future: [],
    }));
  }, []);
  const undo = useCallback(() => {
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            map: h.past.at(-1)!,
            future: [h.map, ...h.future],
          }
        : h,
    );
    setSelection(null);
  }, []);
  const redo = useCallback(() => {
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.map],
            map: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
    setSelection(null);
  }, []);
  const closePreview = useCallback(() => setPreview(null), []);
  useEffect(() => {
    setSaved(false);
    const timer = setTimeout(() => {
      if (validateMap(map).errors.length) {
        setNotice("草稿有结构错误，修复后会自动保存；上一次有效草稿已保留。");
        return;
      }
      try {
        localStorage.setItem(DRAFT, JSON.stringify(map));
        setSaved(true);
      } catch {
        setNotice("浏览器无法保存草稿，请导出 JSON 留存。");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [map]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (
        preview ||
        help ||
        (e.target as HTMLElement)?.matches("input,textarea,select")
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.code === "Escape") setTool("select");
      if ((e.code === "Delete" || e.code === "Backspace") && selection) {
        e.preventDefault();
        commit(removeEntity(map, selection));
        setSelection(null);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [map, selection, preview, help, undo, redo, commit]);
  const project = (p: Point) =>
    view === "top"
      ? { u: p.x, v: p.z }
      : view === "front"
        ? { u: p.x, v: -p.y }
        : { u: p.z, v: -p.y };
  const unproject = (u: number, v: number): Point =>
    view === "top"
      ? { x: u, z: v, y: layer }
      : view === "front"
        ? { x: u, y: -v, z: slice }
        : { x: slice, z: u, y: -v };
  const snapTo = (n: number) => Math.round(n / snap) * snap;
  const eventPoint = (e: React.PointerEvent) => {
    const p = svg.current!.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const local = p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { u: local.x, v: local.y };
  };
  function begin(e: React.PointerEvent, s?: Selection) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    svg.current!.setPointerCapture(e.pointerId);
    const uv = eventPoint(e);
    if (tool === "pan" || e.button === 1) {
      drag.current = {
        pan: true,
        anchor: uv,
        center,
        matrix: svg.current!.getScreenCTM()!.inverse(),
      };
      return;
    }
    if (tool === "select") {
      setSelection(s ?? null);
      if (s)
        drag.current = {
          selection: s,
          anchor: uv,
          point: pointOf(entity(map, s)),
          map,
        };
      return;
    }
    if (tool === "crossing" && map.crossing) {
      setNotice("每图支持一处纸桥断口。先选中已有断口调整，或删除后重建。");
      return;
    }
    try {
      const result = addEntity(
        map,
        tool,
        unproject(snapTo(uv.u), snapTo(uv.v)),
      );
      commit(result.map);
      setSelection(result.selection);
      setTool("select");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "无法添加物件");
    }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const uv = eventPoint(e);
    if (d.pan) {
      const screenPoint = svg.current!.createSVGPoint();
      screenPoint.x = e.clientX;
      screenPoint.y = e.clientY;
      const current = screenPoint.matrixTransform(d.matrix);
      setCenter({
        u: d.center.u + d.anchor.u - current.x,
        v: d.center.v + d.anchor.v - current.y,
      });
      return;
    }
    const start = project(d.point),
      p = unproject(
        snapTo(start.u + uv.u - d.anchor.u),
        snapTo(start.v + uv.v - d.anchor.v),
      );
    if (view === "top") p.y = d.point.y;
    else if (view === "front") p.z = d.point.z;
    else p.x = d.point.x;
    const next = editEntity(d.map, d.selection, p);
    latestDrag.current = next;
    setDragMap(next);
  }
  function end(cancel = false) {
    if (!cancel && latestDrag.current) commit(latestDrag.current);
    drag.current = null;
    latestDrag.current = null;
    setDragMap(null);
  }
  function fit(next = map) {
    const positions = entities(next)
      .filter((e) => e.kind !== "zones")
      .map((e) => project(pointOf(e.data)));
    if (!positions.length) return;
    const us = positions.map((p) => p.u),
      vs = positions.map((p) => p.v),
      minU = Math.min(...us),
      maxU = Math.max(...us),
      minV = Math.min(...vs),
      maxV = Math.max(...vs);
    setCenter({ u: (minU + maxU) / 2, v: (minV + maxV) / 2 });
    setSpan(Math.max(24, maxU - minU + 16, (maxV - minV + 12) / 0.66));
  }
  function load(next: MapFile) {
    commit(structuredClone(next));
    setSelection(null);
    setTool("select");
    fit(next);
    setNotice("已载入地图，可以撤销回到之前的草稿。");
  }
  function toggleWalkthrough() {
    setWalkthrough((open) => {
      try {
        localStorage.setItem(GUIDE_PREF, open ? "collapsed" : "open");
      } catch {}
      return !open;
    });
  }
  function walkthroughAction(action: WalkthroughAction) {
    if (action === "front") {
      setView("front");
      return;
    }
    if (action === "bridge-help") {
      setHelp("bridge");
      return;
    }
    if (action === "preview") {
      if (!report.errors.length) setPreview(parseMap(map));
      return;
    }
    setTool(action);
  }
  const patch = (key: string, value: any) => {
    if (selection) commit(editEntity(map, selection, { [key]: value }));
  };
  const changeMap = (f: (m: MapFile) => void) => {
    const next = structuredClone(map);
    f(next);
    syncRoute(next);
    commit(next);
  };
  async function importFile(f?: File) {
    if (!f) return;
    try {
      if (f.size > 500_000) throw Error("地图文件不能超过 500 KB");
      const next = parseMap(JSON.parse(await f.text()));
      load(next);
      setNotice(`已导入「${next.level.name}」。`);
    } catch (e) {
      setNotice(
        `导入失败，当前草稿已保留：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  function download() {
    try {
      const data = serializeMap(map),
        url = URL.createObjectURL(
          new Blob([data], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        (map.level.name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "rain-map") +
        ".rain-map.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("JSON 已导出，包含地形、天气、纸桥、引导和翻译。");
    } catch (e) {
      setNotice(String(e));
    }
  }
  const numberField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    step = 0.1,
  ) => (
    <label key={label}>
      {label}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? +value.toFixed(3) : ""}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            onChange(e.target.valueAsNumber);
        }}
      />
    </label>
  );
  const field = (label: string, key: string, step = 0.1) =>
    numberField(
      label,
      pointOf(item)[key as keyof Point] ?? item[key],
      (n) => patch(key, n),
      step,
    );
  const selected = (s: Selection) =>
    selection?.kind === s.kind && selection.index === s.index;
  function shape(e: ReturnType<typeof entities>[number]) {
    const d = e.data,
      p = project(pointOf(d)),
      sel = selected(e),
      pointKinds = [
        "keys",
        "stars",
        "checkpoints",
        "signs",
        "pads",
        "spawn",
        "exit",
        "route",
      ];
    // Keep route handles beside the actual objects so a key/rack can be
    // selected and dragged without its linked guide intercepting the touch.
    if (e.kind === "route") {
      p.u += 0.8;
      p.v -= 0.8;
    }
    const width =
      e.kind === "crossing" ? (d.axis === "x" ? d.span : d.depth) : (d.w ?? 1);
    let w = view === "side" ? (d.d ?? width) : width,
      h =
        view === "top"
          ? (d.d ?? 1)
          : (d.h ?? (e.kind === "winds" ? d.height : 0.25));
    if (e.kind === "crossing") {
      w = view === "side" ? (d.axis === "z" ? d.span : d.depth) : width;
      h = view === "top" ? (d.axis === "z" ? d.span : d.depth) : 0.2;
    }
    const point = pointKinds.includes(e.kind),
      label =
        e.kind === "route"
          ? `${e.index + 1}`
          : e.kind === "keys"
            ? "⚿"
            : e.kind === "stars"
              ? "✦"
              : e.kind === "spawn"
                ? "起"
                : e.kind === "exit"
                  ? "终"
                  : e.kind === "checkpoints"
                    ? "架"
                    : e.kind === "pads"
                      ? "门"
                      : e.kind === "signs"
                        ? "文"
                        : e.kind === "hazards"
                          ? "火"
                          : "";
    return (
      <g
        key={`${e.kind}-${e.index}`}
        className={`map-object ${sel ? "selected" : ""}`}
        onPointerDown={(ev) => begin(ev, e)}
        role="button"
        aria-label={`${entityNames[e.kind]} ${e.index + 1}`}
      >
        <title>
          {entityNames[e.kind]} {e.index + 1} · X {pointOf(d).x} / Y{" "}
          {pointOf(d).y} / Z {pointOf(d).z}
        </title>
        {d.motion && (
          <line
            x1={
              p.u -
              (d.motion.axis === (view === "side" ? "z" : "x")
                ? d.motion.range
                : 0)
            }
            x2={
              p.u +
              (d.motion.axis === (view === "side" ? "z" : "x")
                ? d.motion.range
                : 0)
            }
            y1={
              p.v -
              (view === "top" && d.motion.axis === "z" ? d.motion.range : 0)
            }
            y2={
              p.v +
              (view === "top" && d.motion.axis === "z" ? d.motion.range : 0)
            }
            stroke="#bad5e2"
            strokeDasharray=".3 .2"
          />
        )}
        {e.kind === "pads" ? (
          <rect
            x={p.u - 0.65}
            y={p.v - 0.65}
            width={1.3}
            height={1.3}
            rx={0.05}
            fill="#697786"
            stroke={sel ? "#fff7dd" : colors.pads}
            vectorEffect="non-scaling-stroke"
            strokeWidth={sel ? 3 : 1}
          />
        ) : point ? (
          <circle
            cx={p.u}
            cy={p.v}
            r={e.kind === "route" ? 0.38 : 0.55}
            fill={colors[e.kind]}
            fillOpacity={e.kind === "route" ? 0.24 : 1}
            stroke={sel ? "#fff7dd" : colors[e.kind]}
            vectorEffect="non-scaling-stroke"
            strokeWidth={sel ? 3 : 1}
          />
        ) : (
          <rect
            x={p.u - w / 2}
            y={
              view === "top" ? p.v - h / 2 : e.kind === "winds" ? p.v - h : p.v
            }
            width={Math.max(0.15, w)}
            height={Math.max(0.15, h)}
            fill={colors[e.kind]}
            fillOpacity={
              ["zones", "awnings"].includes(e.kind) ||
              ["low-roof", "railing"].includes(d.kind)
                ? 0.14
                : 0.7
            }
            stroke={sel ? "#fff7dd" : colors[e.kind]}
            strokeDasharray={
              ["zones", "awnings"].includes(e.kind) ? ".3 .15" : undefined
            }
            strokeWidth={sel ? 3 : 1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {label && (
          <text
            x={p.u}
            y={p.v + 0.18}
            fontSize={e.kind === "route" ? 0.5 : 0.62}
            textAnchor="middle"
            fill={e.kind === "route" ? "#ffe5ac" : "#21323d"}
            pointerEvents="none"
          >
            {label}
          </text>
        )}
      </g>
    );
  }
  return (
    <main className="editor-app">
      <header className="editor-header">
        <div className="editor-brand">
          <span className="paper-mark">折</span>
          <div>
            <small>BEFORE THE RAIN STOPS / MAP STUDIO</small>
            <h1>
              雨中造景<span>地图编辑器</span>
            </h1>
          </div>
        </div>
        <div className="header-actions">
          <a href="./" target="_blank" rel="noreferrer">
            打开游戏 ↗
          </a>
          <button onClick={toggleWalkthrough}>制作引导</button>
          <button onClick={() => setHelp("start")}>组件说明</button>
          <button onClick={() => file.current?.click()}>导入 JSON</button>
          <button onClick={download} disabled={!!report.errors.length}>
            导出地图 ↓
          </button>
          <button
            className="primary"
            disabled={!!report.errors.length}
            onClick={() => setPreview(parseMap(map))}
          >
            ▶ 试玩地图
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </header>
      <div className="editor-workspace">
        <aside className="palette-panel">
          <div className="section-title">
            <span>01 / 搭建</span>
            <button onClick={() => load(starterMap())}>新建</button>
          </div>
          <p className="palette-instruction">
            ① 选组件 → ② 点画布放置 → ③ 右侧调属性
          </p>
          {TOOL_HELP[tool] && (
            <div className="component-tip" aria-live="polite">
              <strong>{TOOL_HELP[tool]!.title}</strong>
              <p>{TOOL_HELP[tool]!.body}</p>
              <button onClick={() => setHelp(TOOL_HELP[tool]!.topic)}>
                查看示意与说明 ↗
              </button>
            </div>
          )}
          <div className="palette-grid">
            {palette.map(([kind, label, description]) => (
              <button
                key={kind}
                title={description}
                disabled={
                  (kind === "crossing" && !!map.crossing) ||
                  (kind === "pads" && map.level.pads.length >= 2)
                }
                className={tool === kind ? "active" : ""}
                onClick={() => setTool(kind)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="template-area">
            <h3>从现有关卡开始</h3>
            <select
              aria-label="关卡模板"
              value={template}
              onChange={(e) => setTemplate(+e.target.value)}
            >
              {templates.map((m, i) => (
                <option key={i} value={i}>
                  {String(i + 1).padStart(2, "0")} · {m.level.name}
                </option>
              ))}
            </select>
            <button onClick={() => load(templates[template])}>载入模板</button>
            <p className="muted">
              所有 {LEVELS.length}{" "}
              关都能拆开看、修改与导出。载入操作也可以撤销。
            </p>
          </div>
          <div className="legend">
            <i style={{ background: colors.hazards }} /> 旺火{" "}
            <i style={{ background: colors.awnings }} /> 小火篷子{" "}
            <i style={{ background: colors.route }} /> 引导
          </div>
        </aside>
        <section className="canvas-panel">
          <EditorWalkthrough
            open={walkthrough}
            onToggle={toggleWalkthrough}
            onAction={walkthroughAction}
            canPreview={!report.errors.length}
          />
          <div className="canvas-toolbar">
            <div className="button-row">
              <button
                className={tool === "select" ? "active" : ""}
                onClick={() => setTool("select")}
              >
                选择 / 拖动
              </button>
              <button
                className={tool === "pan" ? "active" : ""}
                onClick={() => setTool("pan")}
              >
                平移
              </button>
              <button
                aria-label="撤销"
                disabled={!history.past.length}
                onClick={undo}
              >
                ↶
              </button>
              <button
                aria-label="重做"
                disabled={!history.future.length}
                onClick={redo}
              >
                ↷
              </button>
            </div>
            <div className="button-row">
              {(
                [
                  ["top", "俯视 X/Z"],
                  ["front", "正面 X/Y"],
                  ["side", "侧面 Z/Y"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => {
                    setView(v);
                    setCenter({ u: 10, v: 0 });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="canvas-settings">
            <span>
              {tool === "select"
                ? "拖动对象调整位置"
                : tool === "pan"
                  ? "拖动画布平移"
                  : `点击放置：${palette.find((p) => p[0] === tool)?.[1]}`}
            </span>
            <div className="button-row">
              <label>
                吸附
                <select value={snap} onChange={(e) => setSnap(+e.target.value)}>
                  <option value={0.25}>0.25</option>
                  <option value={0.5}>0.5</option>
                  <option value={1}>1</option>
                </select>
              </label>
              {view === "top"
                ? numberField("放置高度 Y", layer, setLayer, 0.5)
                : numberField(
                    view === "front" ? "深度 Z" : "固定 X",
                    slice,
                    setSlice,
                    0.5,
                  )}
              <button
                aria-label="放大画布"
                onClick={() => setSpan((s) => Math.max(8, s * 0.8))}
              >
                ＋
              </button>
              <button
                aria-label="缩小画布"
                onClick={() => setSpan((s) => Math.min(180, s / 0.8))}
              >
                −
              </button>
              <button onClick={() => fit()}>看全图</button>
            </div>
          </div>
          <div className="map-surface">
            <svg
              ref={svg}
              role="img"
              aria-label="地图搭建画布"
              viewBox={`${center.u - span / 2} ${center.v - (span * 0.66) / 2} ${span} ${span * 0.66}`}
              onPointerDown={(e) => begin(e)}
              onPointerMove={move}
              onPointerUp={() => end()}
              onPointerCancel={() => end(true)}
              onLostPointerCapture={() => {
                if (drag.current) end(true);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <defs>
                <pattern
                  id="grid"
                  width={1}
                  height={1}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 1 0 L 0 0 0 1"
                    fill="none"
                    stroke="#c6d8e01f"
                    strokeWidth=".025"
                  />
                </pattern>
                <pattern
                  id="major"
                  width={5}
                  height={5}
                  patternUnits="userSpaceOnUse"
                >
                  <rect width={5} height={5} fill="url(#grid)" />
                  <path
                    d="M 5 0 L 0 0 0 5"
                    fill="none"
                    stroke="#c6d8e025"
                    strokeWidth=".05"
                  />
                </pattern>
              </defs>
              <rect
                x={-200}
                y={-200}
                width={400}
                height={400}
                fill="url(#major)"
              />
              <path
                d="M -100 0 H 100 M 0 -100 V 100"
                stroke="#9eb8c363"
                strokeWidth=".04"
                pointerEvents="none"
              />
              {all
                .filter((e) => e.kind === "zones" || e.kind === "awnings")
                .map(shape)}
              {all
                .filter((e) => !["zones", "awnings", "route"].includes(e.kind))
                .map(shape)}
              <polyline
                points={display.route
                  .map((r) => {
                    const p = project(r.target);
                    return `${p.u},${p.v}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#e2cba666"
                strokeDasharray=".25 .2"
                strokeWidth=".05"
                pointerEvents="none"
              />
              {all.filter((e) => e.kind === "route").map(shape)}
              {display.crossing && view === "top" && (
                <g pointerEvents="none" aria-label="自动生成的两岸桥钉位置">
                  {([-1, 1] as const).map((side) => {
                    const c = display.crossing!,
                      p = bankPoint(c, side);
                    return (
                      <g key={side}>
                        <circle
                          cx={p.x}
                          cy={p.z}
                          r={0.35}
                          fill="none"
                          stroke="#f0ca81"
                          strokeWidth={0.09}
                        />
                        <text
                          x={p.x}
                          y={p.z + (c.axis === "x" ? 1 : side * 0.8)}
                          textAnchor="middle"
                          fill="#f0ca81"
                          fontSize={0.45}
                        >
                          {side === c.near ? "起始桥钉" : "接应踏板"}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
            <div className="canvas-caption">
              {view === "top"
                ? "俯视图：向右 +X，向下 +Z。高度在属性中调整。"
                : view === "front"
                  ? "正面图：向右 +X，向上 +Y。注意不同深度的重叠物体。"
                  : "侧面图：向右 +Z，向上 +Y。游戏侧面按右键沿 −Z 前进。"}
            </div>
          </div>
          <div className="editor-status" role="status">
            <span className={saved ? "saved" : ""}>
              ● {saved ? "草稿已保存" : "保存中"}
            </span>
            <span>{notice}</span>
          </div>
        </section>
        <aside className="inspector-panel">
          <div className="section-title">
            <span>02 / 属性</span>
            <span className="count-label">
              {map.level.platforms.length} 平台
            </span>
          </div>
          <label>
            地图名称
            <input
              value={map.level.name}
              maxLength={80}
              onChange={(e) =>
                changeMap((m) => {
                  m.level.name = e.target.value;
                })
              }
            />
          </label>
          <label>
            本关提示
            <textarea
              value={map.level.hint}
              maxLength={180}
              onChange={(e) =>
                changeMap((m) => {
                  m.level.hint = e.target.value;
                })
              }
            />
          </label>
          <label>
            许愿架存档方式
            <select
              value={map.level.freeCheckpoints ? "revisit" : "ordered"}
              onChange={(e) =>
                changeMap((m) => {
                  if (e.target.value === "revisit")
                    m.level.freeCheckpoints = true;
                  else delete m.level.freeCheckpoints;
                })
              }
            >
              <option value="ordered">依次前往新架子</option>
              <option value="revisit">允许回访任意架子</option>
            </select>
          </label>
          {numberField(
            "目标关卡",
            map.chapter ?? 1,
            (n) =>
              changeMap((m) => {
                m.chapter = n;
              }),
            1,
          )}
          <p className="hint">
            平台宽、深和连续直路均不得超过 9。第 11
            关起至少需要两个路线中使用的独立互动模块；同类型可重复。当前{" "}
            {interactiveModules(map).length} 个。
          </p>
          <details>
            <summary>背景与雨势</summary>
            <label>
              副标题
              <input
                value={map.level.sub}
                maxLength={180}
                onChange={(e) =>
                  changeMap((m) => {
                    m.level.sub = e.target.value;
                  })
                }
              />
            </label>
            <div className="field-grid">
              <label>
                天空
                <input
                  type="color"
                  value={map.level.sky}
                  onChange={(e) =>
                    changeMap((m) => {
                      m.level.sky = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                平台色
                <input
                  type="color"
                  value={map.level.color}
                  onChange={(e) =>
                    changeMap((m) => {
                      m.level.color = e.target.value;
                    })
                  }
                />
              </label>
              {numberField(
                "雨势周期 / 秒",
                map.weather.period,
                (n) =>
                  changeMap((m) => {
                    m.weather.period = n;
                  }),
                1,
              )}
            </div>
          </details>
          <label>
            选中对象
            <select
              aria-label="选中对象"
              value={selection ? `${selection.kind}:${selection.index}` : ""}
              onChange={(e) => {
                const [kind, index] = e.target.value.split(":");
                setSelection(
                  kind ? { kind: kind as EntityKind, index: +index } : null,
                );
              }}
            >
              <option value="">点击画布选中</option>
              {all.map((e) => (
                <option
                  key={`${e.kind}:${e.index}`}
                  value={`${e.kind}:${e.index}`}
                >
                  {entityNames[e.kind]} {e.index + 1}
                  {e.data.kind
                    ? ` · ${PLATFORM_HELP[e.data.kind]?.[0] ?? e.data.kind}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {item && selection ? (
            <div className="object-inspector">
              <h3>
                {entityNames[selection.kind]} {selection.index + 1}
              </h3>
              {TOOL_HELP[selection.kind] && (
                <div className="object-help">
                  <p>{TOOL_HELP[selection.kind]!.body}</p>
                  <button
                    onClick={() => setHelp(TOOL_HELP[selection.kind]!.topic)}
                  >
                    这个组件怎么用？
                  </button>
                </div>
              )}
              <div className="field-grid">
                {field("X", "x")}
                {selection.kind !== "zones" && field("高度 Y", "y")}
                {field("深度 Z", "z")}
                {["w", "d", "h", "height", "rate", "floor", "span", "depth"]
                  .filter((k) => item[k] !== undefined)
                  .map((k) =>
                    field(
                      (
                        {
                          w: "宽度 W",
                          d: "深度 D",
                          h: "厚度 H",
                          height: "风柱高度",
                          rate: "雨量 / 秒",
                          floor: "小火地面高度",
                          span: "断口长度",
                          depth: "桥面深度",
                        } as any
                      )[k],
                      k,
                    ),
                  )}
              </div>
              {["platforms", "gate"].includes(selection.kind) && (
                <p className="field-help">
                  Y 是顶面；厚度 H 向下延伸，底面为 Y − H。W 沿 X，D 沿
                  Z。改“种类”不会自动改变这些尺寸。
                </p>
              )}
              {selection.kind === "platforms" && (
                <>
                  <label>
                    平台种类
                    <select
                      value={item.kind ?? "normal"}
                      onChange={(e) =>
                        commit(
                          editEntity(
                            map,
                            selection,
                            platformStylePatch(item, e.target.value),
                          ),
                        )
                      }
                    >
                      <optgroup label="常用平台">
                        {["normal", "step", "wall", "moving"].map((k) => (
                          <option key={k} value={k}>
                            {PLATFORM_HELP[k][0]}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="纸桥专用 · 建议由组件生成">
                        {["low-roof", "railing"].map((k) => (
                          <option key={k} value={k}>
                            {PLATFORM_HELP[k][0]}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <p className="field-help">
                    {PLATFORM_HELP[item.kind ?? "normal"]?.[1]}{" "}
                    <button
                      className="text-link"
                      onClick={() => setHelp("platform")}
                    >
                      种类对照表 ↗
                    </button>
                  </p>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={!!item.motion}
                      onChange={(e) =>
                        commit(
                          editEntity(
                            map,
                            selection,
                            platformMotionPatch(item, e.target.checked),
                          ),
                        )
                      }
                    />
                    开启往返移动（渡台）
                  </label>
                  <p className="field-help">
                    {item.motion
                      ? "开局就自动往返，站稳的纸鹤会随平台移动。下方可以播放或拖动时间预览。"
                      : "当前平台固定不动。勾选后，它与左侧“渡台”使用同一套运动规则。"}{" "}
                    <button
                      className="text-link"
                      onClick={() => setHelp("motion")}
                    >
                      参数怎么填？
                    </button>
                  </p>
                </>
              )}
              {item.motion && (
                <>
                  <label>
                    移动方向
                    <select
                      value={item.motion.axis}
                      onChange={(e) =>
                        patch("motion", {
                          ...item.motion,
                          axis: e.target.value,
                        })
                      }
                    >
                      <option value="x">X · 左右往返</option>
                      <option value="z">Z · 前后往返</option>
                    </select>
                  </label>
                  <div className="field-grid">
                    {numberField("单侧移动距离", item.motion.range, (n) =>
                      patch("motion", { ...item.motion, range: n }),
                    )}
                    {numberField("完整往返 / 秒", item.motion.period, (n) =>
                      patch("motion", { ...item.motion, period: n }),
                    )}
                  </div>
                  <MotionPreview
                    key={`${selection.kind}:${selection.index}`}
                    platform={item}
                  />
                </>
              )}
              {selection.kind === "hazards" && (
                <>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={item.period !== undefined}
                      onChange={(e) =>
                        patch("period", e.target.checked ? 5 : undefined)
                      }
                    />
                    间歇熄火
                  </label>
                  {item.period !== undefined &&
                    field("火焰周期 / 秒", "period")}
                  <p className="muted">
                    周期前 48% 为旺火，之后熄灭。旺火自带篷子；篷子不能挡火。
                  </p>
                </>
              )}
              {selection.kind === "crossing" && (
                <>
                  <label>
                    桥方向
                    <select
                      value={item.axis}
                      onChange={(e) => patch("axis", e.target.value)}
                    >
                      <option value="x">X · 左右跨过（正面）</option>
                      <option value="z">Z · 前后跨过（侧面）</option>
                    </select>
                  </label>
                  <label>
                    起始岸
                    <select
                      value={item.near}
                      onChange={(e) => patch("near", +e.target.value)}
                    >
                      <option value={-1}>
                        {item.axis === "x" ? "左岸 · X 较小" : "Z 较小的一岸"}
                      </option>
                      <option value={1}>
                        {item.axis === "x" ? "右岸 · X 较大" : "Z 较大的一岸"}
                      </option>
                    </select>
                  </label>
                  <div className="help-note compact">
                    <strong>桥钉不用另加，单人也一样</strong>
                    <p>
                      单人：岸边按住 Shift 2 秒自动接桥。任何人到对岸木踏板站住
                      2 秒也能接桥，走哪条路都可以。
                    </p>
                    <button onClick={() => setHelp("bridge")}>
                      看完整纸桥示意 ↗
                    </button>
                  </div>
                  <p className="muted">
                    组件已经生成两岸、低檐和侧栏。改变断口方向、位置或高度后，请一并调整这些平台。
                  </p>
                </>
              )}
              {selection.kind === "awnings" && (
                <p className="muted">
                  Y
                  是篷子高度，小火地面高度决定烤干位置。第一座篷子的小火靠左放置，给起点留出安全空间。
                </p>
              )}
              {item.text !== undefined && (
                <label>
                  路牌文字
                  <textarea
                    value={item.text}
                    maxLength={100}
                    onChange={(e) => patch("text", e.target.value)}
                  />
                </label>
              )}
              {selection.kind === "signs" && (
                <label>
                  显示视角
                  <select
                    value={item.view ?? "both"}
                    onChange={(e) =>
                      patch(
                        "view",
                        e.target.value === "both" ? undefined : +e.target.value,
                      )
                    }
                  >
                    <option value="both">两面可见</option>
                    <option value={0}>正面</option>
                    <option value={1}>侧面</option>
                  </select>
                </label>
              )}
              {selection.kind === "route" && (
                <>
                  <label>
                    引导动作
                    <select
                      value={item.kind}
                      disabled={item.kind === "exit"}
                      onChange={(e) => {
                        const kind = e.target.value;
                        const references =
                          kind === "key"
                            ? map.level.keys
                            : kind === "rack"
                              ? map.level.checkpoints
                              : kind === "ferry"
                                ? map.level.platforms
                                : null;
                        const id =
                          kind === "ferry"
                            ? map.level.platforms.findIndex((p) => p.motion)
                            : 0;
                        commit(
                          editEntity(map, selection, {
                            kind,
                            ...(references ? { id: Math.max(0, id) } : {}),
                            ...(kind === "wind"
                              ? { from: { ...item.target } }
                              : {}),
                          }),
                        );
                      }}
                    >
                      {[
                        "walk",
                        "jump",
                        "rack",
                        "key",
                        "bridge",
                        "wind",
                        "ferry",
                        "pads",
                        "exit",
                      ].map((k) => (
                        <option key={k} value={k}>
                          {
                            (
                              {
                                walk: "走到目标",
                                jump: "跳到目标",
                                rack: "前往许愿架",
                                key: "拾取钥匙",
                                bridge: "搭桥过岸",
                                wind: "乘风上升",
                                ferry: "乘坐渡台",
                                pads: "踏板开门",
                                exit: "抵达终点",
                              } as Record<string, string>
                            )[k]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    所需视角
                    <select
                      value={item.view}
                      onChange={(e) => patch("view", +e.target.value)}
                    >
                      <option value={0}>正面 X</option>
                      <option value={1}>侧面 Z</option>
                    </select>
                  </label>
                  {["key", "rack", "ferry"].includes(item.kind) && (
                    <label>
                      关联对象
                      <select
                        value={item.id ?? ""}
                        onChange={(e) => patch("id", +e.target.value)}
                      >
                        <option value="" disabled>
                          选择要引导的对象
                        </option>
                        {(item.kind === "key"
                          ? map.level.keys
                          : item.kind === "rack"
                            ? map.level.checkpoints
                            : map.level.platforms
                        ).map(
                          (p, i) =>
                            (item.kind !== "ferry" ||
                              ("motion" in p && Boolean(p.motion))) && (
                              <option key={i} value={i}>
                                {item.kind === "key"
                                  ? "钥匙"
                                  : item.kind === "rack"
                                    ? "许愿架"
                                    : "渡台"}{" "}
                                {i + 1}
                              </option>
                            ),
                        )}
                      </select>
                    </label>
                  )}
                  {item.kind === "jump" && (
                    <label>
                      空中转面
                      <input
                        type="checkbox"
                        checked={!!item.via}
                        onChange={(e) =>
                          patch(
                            "via",
                            e.target.checked ? { ...item.target } : undefined,
                          )
                        }
                      />
                    </label>
                  )}
                  {item.kind === "jump" && item.via && (
                    <div className="field-grid">
                      {(["x", "y", "z"] as const).map((k) =>
                        numberField(`空中转弯点 ${k}`, item.via[k], (n) =>
                          patch("via", { ...item.via, [k]: n }),
                        ),
                      )}
                    </div>
                  )}
                  {item.kind === "wind" && (
                    <div className="field-grid">
                      {(["x", "y", "z"] as const).map((k) =>
                        numberField(`风柱起点 ${k}`, item.from?.[k] ?? 0, (n) =>
                          patch("from", {
                            ...(item.from ?? { x: 0, y: 0, z: 0 }),
                            [k]: n,
                          }),
                        ),
                      )}
                    </div>
                  )}
                  {item.kind === "ferry" && (
                    <label>
                      换乘目标
                      <select
                        value={item.landingId ?? ""}
                        onChange={(e) =>
                          patch(
                            "landingId",
                            e.target.value === "" ? undefined : +e.target.value,
                          )
                        }
                      >
                        <option value="">固定对岸（目标坐标）</option>
                        {map.level.platforms.map(
                          (p, i) =>
                            p.motion &&
                            i !== item.id && (
                              <option key={i} value={i}>
                                换到渡台 {i + 1}
                              </option>
                            ),
                        )}
                      </select>
                    </label>
                  )}
                  {item.kind === "ferry" && (
                    <label>
                      渡台携带钥匙
                      <select
                        value={item.requiredKey ?? ""}
                        onChange={(e) =>
                          patch(
                            "requiredKey",
                            e.target.value === "" ? undefined : +e.target.value,
                          )
                        }
                      >
                        <option value="">不需要</option>
                        {map.level.keys.map((_, i) => (
                          <option key={i} value={i}>
                            钥匙 {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="button-row">
                    <button
                      disabled={selection.index === 0 || item.kind === "exit"}
                      onClick={() => {
                        const i = selection.index;
                        changeMap((m) => {
                          [m.route[i - 1], m.route[i]] = [
                            m.route[i],
                            m.route[i - 1],
                          ];
                        });
                        setSelection({ ...selection, index: i - 1 });
                      }}
                    >
                      步骤前移
                    </button>
                    <button
                      disabled={
                        selection.index >= map.route.length - 2 ||
                        item.kind === "exit"
                      }
                      onClick={() => {
                        const i = selection.index;
                        changeMap((m) => {
                          [m.route[i + 1], m.route[i]] = [
                            m.route[i],
                            m.route[i + 1],
                          ];
                        });
                        setSelection({ ...selection, index: i + 1 });
                      }}
                    >
                      步骤后移
                    </button>
                  </div>
                  <p className="muted">
                    钥匙、许愿架、纸桥、踏板和终点引导会跟随原对象坐标。路线顺序请按实际行走顺序排列。
                  </p>
                </>
              )}
              <div className="button-row object-actions">
                <button
                  disabled={[
                    "spawn",
                    "exit",
                    "gate",
                    "crossing",
                    "route",
                  ].includes(selection.kind)}
                  onClick={() => {
                    try {
                      const r = duplicateEntity(map, selection);
                      commit(r.map);
                      setSelection(r.selection);
                    } catch (e) {
                      setNotice(
                        e instanceof Error ? e.message : "无法复制物件",
                      );
                    }
                  }}
                >
                  复制
                </button>
                <button
                  className="danger"
                  disabled={
                    ["spawn", "exit"].includes(selection.kind) ||
                    (selection.kind === "route" && item.kind === "exit")
                  }
                  onClick={() => {
                    commit(removeEntity(map, selection));
                    setSelection(null);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-inspector">
              选择一个物件来调整坐标、大小与玩法。
              <br />
              看不到的对象也可以从上方列表选中。
            </div>
          )}
          <details className="validation" open>
            <summary>
              03 / 检查 ·{" "}
              {report.errors.length
                ? `${report.errors.length} 项待修复`
                : "结构通过"}
              {report.warnings.length
                ? ` · ${report.warnings.length} 条提醒`
                : ""}
            </summary>
            {report.errors.map((x, i) => (
              <p className="error" key={`e${i}`}>
                {x}
              </p>
            ))}
            {report.warnings.map((x, i) => (
              <p key={`w${i}`}>{x}</p>
            ))}
            <p className="muted">
              结构校验不会判断所有跳跃是否可达。导出前请试玩，检查钥匙、存档顺序、火堆和终点。
            </p>
          </details>
        </aside>
      </div>
      {help && (
        <EditorHelp
          topic={help}
          onTopic={setHelp}
          onClose={() => setHelp(null)}
        />
      )}
      {preview && (
        <Suspense fallback={<div className="editor-scrim">正在准备试玩…</div>}>
          <MapPreview map={preview} onClose={closePreview} />
        </Suspense>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
