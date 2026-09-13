import { useEffect, useRef, useState } from "react";
import { MAX_FOLDS, newGame, stepGame } from "./game";
import { PaperScene } from "./scene";
import { FrameBudget } from "./frame-budget";
import { TouchInput, mergeInput, type TouchField } from "./touch-input";
import { KeyboardInput, bindGameKeyboard } from "./keyboard-input";
import { bindTouchControls } from "./touch-controls";
import { installPreviewMap } from "./preview-map";
import type { MapFile } from "./map-format";
import { guideFor, newGuideTracker, words } from "./guide";
import { FIRE_WARNING } from "./weather";
export default function MapPreview({
  map,
  onClose,
}: {
  map: MapFile;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    keyboard = useRef(new KeyboardInput()),
    touch = useRef(new TouchInput()),
    touchRoot = useRef<HTMLDivElement>(null),
    pause = useRef(false);
  const [seed, setSeed] = useState(0),
    [paused, setPaused] = useState(false),
    [hud, setHud] = useState({
      wet: 0,
      heat: 0,
      folds: MAX_FOLDS,
      keys: 0,
      deaths: 0,
      won: false,
      view: 0,
      cue: "",
    }),
    [error, setError] = useState("");
  useEffect(() => {
    if (touchRoot.current)
      return bindTouchControls(touchRoot.current, touch.current);
  }, [map, seed]);
  useEffect(() => {
    setError("");
    keyboard.current.clear();
    touch.current.clear();
    const preview = installPreviewMap(map);
    const g = newGame(1, preview.index),
      tracker = newGuideTracker(),
      compact = matchMedia("(pointer: coarse), (max-width: 900px)");
    let scene: PaperScene;
    try {
      scene = new PaperScene(canvas.current!);
    } catch (e) {
      setError("无法启动 3D 试玩：" + String(e));
      preview.restore();
      return;
    }
    const unbind = bindGameKeyboard(keyboard.current, {
      enabled: () =>
        !pause.current && !document.hidden && g.status === "playing",
      escape: onClose,
      clear: () => touch.current.clear(),
    });
    let frame = 0,
      last = performance.now(),
      acc = 0,
      ui = 0;
    const budget = new FrameBudget();
    const update = (now: number) => {
      if (document.hidden) {
        last = now;
        acc = 0;
        return;
      }
      if (!budget.ready(now, pause.current ? 30 : 60)) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      const input = mergeInput(
        keyboard.current.read(now),
        touch.current.read(now),
      );
      if (pause.current || document.hidden) acc = 0;
      else
        while (acc >= 1 / 60) {
          stepGame(g, { 0: input });
          acc -= 1 / 60;
        }
      const guide = guideFor(g, 0, tracker);
      scene.render(g, 0, dt, false, "zh", guide.target, compact.matches);
      if (now - ui > 100) {
        const p = g.players[0];
        setHud({
          wet: Math.round(p.wetness),
          heat: Math.round(p.heat),
          folds: p.foldsLeft,
          keys: g.keys.length,
          deaths: p.deaths,
          won: g.status === "won",
          view: g.view,
          cue: words(guide.title, "zh"),
        });
        ui = now;
      }
    };
    const loop = (now: number) => {
      try {
        update(now);
      } catch {
        setError("场景渲染中断，请重新试玩。");
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    canvas.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
      unbind();
      preview.restore();
    };
  }, [map, seed, onClose]);
  const button = (
    field: TouchField,
    value: number | boolean,
    label: string,
  ) => (
    <button
      key={label}
      disabled={paused || hud.won}
      data-touch-field={field}
      data-touch-value={String(value)}
    >
      {label}
    </button>
  );
  return (
    <div
      className="preview-screen"
      role="dialog"
      aria-modal="true"
      aria-label="地图试玩"
    >
      <canvas ref={canvas} tabIndex={0} aria-label="地图试玩场景" />
      <div className="preview-top">
        <div>
          <small>PLAYTEST · 单人试玩</small>
          <strong>{map.level.name}</strong>
        </div>
        <div className="button-row">
          <button
            onClick={() => {
              touch.current.clear();
              keyboard.current.clear();
              pause.current = !pause.current;
              setPaused(pause.current);
            }}
          >
            {paused ? "继续" : "暂停"}
          </button>
          <button
            onClick={() => {
              pause.current = false;
              setPaused(false);
              setSeed((v) => v + 1);
            }}
          >
            重新试玩
          </button>
          <button className="primary" onClick={onClose}>
            返回编辑 Esc
          </button>
        </div>
      </div>
      <div className="preview-status">
        湿度 {hud.wet}% · 热度 {hud.heat} · 耐折 {hud.folds}/{MAX_FOLDS} · 钥匙{" "}
        {hud.keys}/{map.level.keys.length} · 失败 {hud.deaths} ·{" "}
        {hud.view ? "侧面" : "正面"}
      </div>
      <div className="preview-instructions">
        <strong>{hud.cue}</strong>
        <br />
        {hud.heat >= FIRE_WARNING
          ? "快离开火边，继续烤会脆裂！"
          : hud.wet >= 60
            ? "纸已经很湿，靠近小火烤干。"
            : "方向键移动 · 空格跳跃/滑翔 · Q 转面 · Shift / B 纸桥 · S 挡雨 · F 修补 · R 回存档"}
      </div>
      {(hud.won || error) && (
        <div className="preview-result">
          <h2>{error ? "试玩未启动" : "这张地图可以通关了"}</h2>
          <p>
            {error ||
              `已收齐 ${hud.keys} 把钥匙并到达终点。可返回编辑，继续调整或导出地图。`}
          </p>
          <button onClick={onClose}>返回编辑</button>
        </div>
      )}
      <div ref={touchRoot} className="preview-controls">
        <div>
          {button("axis", -1, "←")}
          {button("axis", 1, "→")}
        </div>
        <div>
          {button("turn", true, "转面")}
          {button("fold", true, "按住纸桥")}
          {button("shelter", true, "按住挡雨")}
          {button("repair", true, "按住修补")}
          {button("reset", true, "回存档")}
          {button("jump", true, "跳跃 / 按住滑翔")}
        </div>
      </div>
    </div>
  );
}
