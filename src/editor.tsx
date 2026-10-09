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
  moveEntity,
  entities,
  entity,
  entityNames,
  pointOf,
  removeEntity,
  type EntityKind,
  type Selection,
  type EditorEntity,
  type Tool,
} from "./editor-model";
import {
  EditorHelp,
  EditorWalkthrough,
  TOOL_HELP,
  type HelpTopic,
  type WalkthroughAction,
} from "./editor-help";
import { EditorInspector, numberField } from "./editor-inspector";
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
type Drag =
  | {
      kind: "pan";
      anchor: { u: number; v: number };
      center: { u: number; v: number };
      matrix: DOMMatrix;
    }
  | {
      kind: "entity";
      selection: Selection;
      anchor: { u: number; v: number };
      point: Point;
      map: MapFile;
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
    drag = useRef<Drag | null>(null),
    latestDrag = useRef<MapFile | null>(null);
  const display = dragMap ?? map,
    report = useMemo(() => validateMap(map), [map]),
    all = entities(display);
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
        kind: "pan",
        anchor: uv,
        center,
        matrix: svg.current!.getScreenCTM()!.inverse(),
      };
      return;
    }
    if (tool === "select") {
      setSelection(s ?? null);
      const selected = s && entity(map, s);
      if (selected)
        drag.current = {
          kind: "entity",
          selection: selected,
          anchor: uv,
          point: pointOf(selected.data),
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
    if (d.kind === "pan") {
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
    const next = moveEntity(d.map, d.selection, p);
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
  const selected = (s: Selection) =>
    selection?.kind === s.kind && selection.index === s.index;
  function shape(e: EditorEntity) {
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
      e.kind === "crossing"
        ? e.data.axis === "x"
          ? e.data.span
          : e.data.depth
        : "w" in d
          ? d.w
          : 1;
    let w = view === "side" ? ("d" in d ? d.d : width) : width,
      h =
        view === "top"
          ? "d" in d
            ? d.d
            : 1
          : "h" in d
            ? d.h
            : e.kind === "winds"
              ? e.data.height
              : 0.25;
    if (e.kind === "crossing") {
      w =
        view === "side"
          ? e.data.axis === "z"
            ? e.data.span
            : e.data.depth
          : width;
      h =
        view === "top"
          ? e.data.axis === "z"
            ? e.data.span
            : e.data.depth
          : 0.2;
    }
    const motion =
      e.kind === "platforms" || e.kind === "gate" ? e.data.motion : undefined;
    const platformKind =
      e.kind === "platforms" || e.kind === "gate" ? e.data.kind : undefined;
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
        {motion && (
          <line
            x1={
              p.u -
              (motion.axis === (view === "side" ? "z" : "x") ? motion.range : 0)
            }
            x2={
              p.u +
              (motion.axis === (view === "side" ? "z" : "x") ? motion.range : 0)
            }
            y1={
              p.v - (view === "top" && motion.axis === "z" ? motion.range : 0)
            }
            y2={
              p.v + (view === "top" && motion.axis === "z" ? motion.range : 0)
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
              ["low-roof", "railing"].includes(platformKind ?? "")
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
        <EditorInspector
          map={map}
          report={report}
          all={all}
          selected={selection ? entity(display, selection) : undefined}
          commit={commit}
          setSelection={setSelection}
          onHelp={setHelp}
          onNotice={setNotice}
        />
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
