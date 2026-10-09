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
import { PreviewClock } from "./preview-clock";
import { qualityMode } from "./render-quality";
import { stored } from "./storage";
import type { ContextStatus } from "./context-recovery";
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
    playback = useRef(new PreviewClock());
  const [seed, setSeed] = useState(0),
    [paused, setPaused] = useState(false),
    [sceneStatus, setSceneStatus] = useState<
      "loading" | "ready" | ContextStatus
    >("loading"),
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
    setSceneStatus("loading");
    keyboard.current.clear();
    touch.current.clear();
    const clock = playback.current;
    clock.reset(performance.now());
    const preview = installPreviewMap(map);
    const g = newGame(1, preview.index),
      tracker = newGuideTracker(),
      compact = matchMedia("(pointer: coarse), (max-width: 900px)");
    const initial = g.players[0];
    setHud({
      wet: Math.round(initial.wetness),
      heat: Math.round(initial.heat),
      folds: initial.foldsLeft,
      keys: 0,
      deaths: 0,
      won: false,
      view: 0,
      cue: "",
    });
    let scene: PaperScene;
    let cancelled = false,
      preparing = 0,
      frame = 0,
      ui = 0;
    const clear = () => {
      keyboard.current.clear();
      touch.current.clear();
    };
    const prepare = async () => {
      const revision = ++preparing;
      try {
        const guide = guideFor(g, 0, tracker);
        const ready = await scene.prepare(
          g,
          0,
          false,
          "zh",
          guide.target,
          compact.matches,
        );
        if (cancelled || revision !== preparing || !ready) return;
        clock.prepared(performance.now());
        setSceneStatus("ready");
      } catch (error) {
        if (cancelled || revision !== preparing) return;
        clock.ready = false;
        clear();
        setError("场景准备中断，请重新试玩。" + String(error));
      }
    };
    try {
      scene = new PaperScene(canvas.current!, {
        quality: qualityMode(stored("local", "rain-render-quality")),
        onContextStatus: (status) => {
          if (cancelled) return;
          preparing++;
          clock.context(status, performance.now());
          clear();
          setSceneStatus(status === "restored" ? "loading" : status);
          if (status === "restored") void prepare();
        },
      });
    } catch (e) {
      setError("无法启动 3D 试玩：" + String(e));
      preview.restore();
      return;
    }
    const unbind = bindGameKeyboard(keyboard.current, {
      enabled: () => clock.active(document.hidden) && g.status === "playing",
      escape: onClose,
      clear: () => touch.current.clear(),
    });
    const visibility = () => {
      clock.sync(performance.now());
      clear();
      scene.observeFrame(performance.now(), false);
    };
    document.addEventListener("visibilitychange", visibility);
    const budget = new FrameBudget();
    const update = (now: number) => {
      if (document.hidden || !clock.ready || clock.lost) {
        scene.observeFrame(now, false);
        clock.sync(now);
        return;
      }
      if (!budget.ready(now, clock.paused ? 30 : 60)) return;
      scene.observeFrame(now, clock.active() && g.status === "playing");
      const input = mergeInput(
        keyboard.current.read(now),
        touch.current.read(now),
      );
      const dt = clock.advance(now, false, g.status === "playing", () =>
        stepGame(g, { 0: input }),
      );
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
      if (cancelled) return;
      try {
        update(now);
      } catch {
        clock.ready = false;
        clear();
        setError("场景渲染中断，请重新试玩。");
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    void prepare();
    frame = requestAnimationFrame(loop);
    canvas.current?.focus();
    return () => {
      cancelled = true;
      preparing++;
      clock.ready = false;
      clear();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      scene.dispose();
      unbind();
      preview.restore();
    };
  }, [map, seed, onClose]);
  const restart = () => {
    playback.current.pause(false, performance.now());
    setPaused(false);
    setSeed((v) => v + 1);
  };
  const button = (
    field: TouchField,
    value: number | boolean,
    label: string,
  ) => (
    <button
      key={label}
      disabled={paused || hud.won || sceneStatus !== "ready" || !!error}
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
            disabled={sceneStatus !== "ready" || !!error}
            onClick={() => {
              touch.current.clear();
              keyboard.current.clear();
              playback.current.pause(
                !playback.current.paused,
                performance.now(),
              );
              setPaused(playback.current.paused);
            }}
          >
            {paused ? "继续" : "暂停"}
          </button>
          <button onClick={restart}>重新试玩</button>
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
      {(hud.won || error || sceneStatus !== "ready") && (
        <div className="preview-result">
          <h2>
            {error || sceneStatus === "failed"
              ? "试玩画面中断"
              : sceneStatus === "lost"
                ? "正在恢复画面"
                : sceneStatus === "loading"
                  ? "正在准备试玩"
                  : "这张地图可以通关了"}
          </h2>
          <p>
            {error ||
              (sceneStatus === "failed"
                ? "画面暂未恢复，试玩已暂停。可以重新试玩或返回编辑。"
                : sceneStatus === "lost"
                  ? "试玩已暂停，角色不会继续淋雨。恢复后保留当前进度与暂停状态。"
                  : sceneStatus === "loading"
                    ? "正在准备场景，等待期间暂停计时。"
                    : `已收齐 ${hud.keys} 把钥匙并到达终点。可返回编辑，继续调整或导出地图。`)}
          </p>
          {(!!error || sceneStatus === "failed") && (
            <button onClick={restart}>重新试玩</button>
          )}
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
