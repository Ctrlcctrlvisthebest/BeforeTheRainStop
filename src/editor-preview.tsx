import React, { useEffect, useRef, useState } from "react";
import { LEVELS, newGame, stepGame, idleInput, type Input } from "./game";
import {
  WEATHER,
  CAMPFIRES,
  firesForWeather,
  BLAZE_ROOFS,
  blazeRoofsFor,
} from "./weather";
import { CROSSINGS } from "./bridges";
import { PaperScene } from "./scene";
import { TouchInput, mergeInput, type TouchField } from "./touch-input";
import type { MapFile } from "./map-format";
import { GUIDE_ROUTES, guideFor, newGuideTracker, words } from "./guide";
const previewLevel = LEVELS.length;
export default function MapPreview({
  map,
  onClose,
}: {
  map: MapFile;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    keyboard = useRef(idleInput()),
    touch = useRef(new TouchInput()),
    pause = useRef(false);
  const [seed, setSeed] = useState(0),
    [paused, setPaused] = useState(false),
    [hud, setHud] = useState({
      wet: 0,
      heat: 0,
      folds: 6,
      keys: 0,
      deaths: 0,
      won: false,
      view: 0,
      cue: "",
    }),
    [error, setError] = useState("");
  useEffect(() => {
    LEVELS[previewLevel] = structuredClone(map.level);
    WEATHER[previewLevel] = structuredClone(map.weather);
    CAMPFIRES[previewLevel] = firesForWeather(map.weather);
    BLAZE_ROOFS[previewLevel] = blazeRoofsFor(map.level);
    GUIDE_ROUTES[previewLevel] = structuredClone(map.route);
    if (map.crossing) CROSSINGS[previewLevel] = structuredClone(map.crossing);
    else delete CROSSINGS[previewLevel];
    const g = newGame(1, previewLevel),
      tracker = newGuideTracker(),
      compact = matchMedia("(pointer: coarse), (max-width: 900px)");
    let scene: PaperScene;
    try {
      scene = new PaperScene(canvas.current!);
    } catch (e) {
      setError("无法启动 3D 试玩：" + String(e));
      return;
    }
    const held = new Set<string>();
    const refresh = () =>
      (keyboard.current = {
        axis:
          (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) -
          (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0),
        jump: held.has("Space") || held.has("KeyW") || held.has("ArrowUp"),
        turn: held.has("KeyQ") || held.has("KeyE"),
        fold: held.has("ShiftLeft") || held.has("ShiftRight"),
        shelter: held.has("KeyS") || held.has("ArrowDown"),
        repair: held.has("KeyF"),
        reset: held.has("KeyR"),
      });
    const clear = () => {
      held.clear();
      keyboard.current = idleInput();
      touch.current.clear();
    };
    const pulses: Record<string, TouchField> = {
      Space: "jump",
      KeyW: "jump",
      ArrowUp: "jump",
      KeyQ: "turn",
      KeyE: "turn",
      KeyR: "reset",
    };
    const pulseId = (code: string) => -100 + Object.keys(pulses).indexOf(code);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (
        [
          "ArrowRight",
          "ArrowLeft",
          "ArrowUp",
          "ArrowDown",
          "KeyA",
          "KeyD",
          "Space",
          "KeyW",
          "KeyQ",
          "KeyE",
          "KeyS",
          "KeyF",
          "KeyR",
          "ShiftLeft",
          "ShiftRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
        if (pulses[e.code] && !held.has(e.code))
          touch.current.press(
            pulseId(e.code),
            pulses[e.code],
            true,
            performance.now(),
          );
        held.add(e.code);
        refresh();
      }
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.code);
      if (pulses[e.code])
        touch.current.release(pulseId(e.code), performance.now());
      refresh();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    let frame = 0,
      last = performance.now(),
      acc = 0,
      ui = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      const input = mergeInput(keyboard.current, touch.current.read(now));
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
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    canvas.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
      clear();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
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
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        touch.current.press(e.pointerId, field, value, performance.now());
      }}
      onPointerUp={(e) => touch.current.release(e.pointerId, performance.now())}
      onPointerCancel={(e) => touch.current.cancel(e.pointerId)}
      onLostPointerCapture={(e) => touch.current.cancel(e.pointerId)}
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
              keyboard.current = idleInput();
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
        湿度 {hud.wet}% · 热度 {hud.heat} · 耐折 {hud.folds}/6 · 钥匙 {hud.keys}
        /{map.level.keys.length} · 失败 {hud.deaths} ·{" "}
        {hud.view ? "侧面" : "正面"}
      </div>
      <div className="preview-instructions">
        <strong>{hud.cue}</strong>
        <br />
        {hud.heat >= 65
          ? "快离开火边，继续烤会脆裂！"
          : hud.wet >= 60
            ? "纸已经很湿，靠近小火烤干。"
            : "方向键移动 · 空格跳跃/滑翔 · Q 转面 · Shift 纸桥 · S 挡雨 · F 修补 · R 回存档"}
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
      <div className="preview-controls">
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
