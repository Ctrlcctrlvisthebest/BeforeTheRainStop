import { SafeRestartButton } from "./safe-restart";
import { createGameAudioEvents } from "./game-audio-events";
import { QualityControls, useQualityPreference } from "./quality-controls";
import { RainSelect } from "./rain-select";
import { TeamControls } from "./team-controls";
import { GameStatus } from "./game-status";
import { RouteMap } from "./route-map";
import "./team-controls.css";
import { MINITOOL } from "./build-target";
import { editionCopy } from "./edition-copy";
import { rankedClear } from "./score-rules";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "./app-error-boundary";
import {
  LEVELS,
  MODES,
  COLORS,
  idleInput,
  newGame,
  type Game,
  type Input,
  type Mode,
} from "./game";
import { api } from "./api";
import { useRoomSession } from "./room-session";
import { useGameRuntime, type AppPhase } from "./game-runtime";
import { save, stored } from "./storage";
import { KeyboardInput, bindGameKeyboard } from "./keyboard-input";
import { bindTouchControls } from "./touch-controls";
import type { PublicRoom } from "./room";
import { warmScene } from "./scene-loader";
import {
  LocalRecords,
  bestTimeFor,
  formatTime,
  type Completion,
} from "./records";
import { ReplayRecorder } from "./replay";
import { playerIdentity } from "./ranking-client";
import { Leaderboard, useScoreSubmission } from "./ranking-ui";
import {
  NAME_LIMIT,
  NAME_REJECTED,
  NAME_TOO_LONG,
  reviewNameFormat,
} from "./player-name";
import "./style.css";
import "./mobile.css";
import "./play-layout.css";
import "./rain-ui.css";
import { TouchInput, mergeInput, type TouchField } from "./touch-input";
import { useCompactControls, touchCopy } from "./mobile";
import { useGameAudio, MusicControls } from "./audio";
import { translate, type Language } from "./i18n";
import { CROSSINGS } from "./bridges";
import type { Lesson } from "./guide";
import { HowToPlay, GoalFlow } from "./guide-ui";
const initialCode = MINITOOL
  ? ""
  : (new URLSearchParams(location.search).get("room") ?? "");
function App() {
  const compact = useCompactControls();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() =>
    stored<string>("local", "rain-language") === "en" ? "en" : "zh",
  );
  const t = (text: string) => translate(language, editionCopy(text));
  useEffect(() => {
    save("local", "rain-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title =
      translate(language, "雨停之前") + " · " + translate(language, "纸上祈愿");
  }, [language]);
  const [initialGame] = useState(() => newGame(1));
  const [records] = useState(() => new LocalRecords());
  const [playerToken] = useState(playerIdentity);
  const [replay] = useState(() => new ReplayRecorder());
  const soloName = useRef("");
  const ranking = useScoreSubmission();
  const [retryingTeamScore, setRetryingTeamScore] = useState(false);
  const [bestTimes, setBestTimes] = useState(() => records.times);
  const [completion, setCompletion] = useState<Completion | null>(null);
  function recordWin(g: Game) {
    const result = records.record(g);
    if (result) {
      setBestTimes(records.times);
      setCompletion(result);
      if (!MINITOOL && g.mode === 1) {
        const trace = replay.snapshot(g);
        void ranking.submit(
          g.id,
          trace
            ? {
                level: g.level,
                name: soloName.current,
                playerToken,
                replay: trace,
              }
            : null,
        );
      }
    }
  }
  const [quality, setQuality] = useQualityPreference();
  const audioEvents = useRef(createGameAudioEvents());
  const canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<Game>(initialGame),
    input = useRef<Input>(idleInput()),
    keyboardInput = useRef(new KeyboardInput()),
    touchInput = useRef(new TouchInput()),
    touchRoot = useRef<HTMLDivElement>(null),
    phaseRef = useRef<AppPhase>("menu");
  const [phase, setPhase] = useState<AppPhase>("menu"),
    [mode, setMode] = useState<Mode>(1),
    [level, setLevel] = useState(0),
    [name, setName] = useState(() => {
      const saved = stored<unknown>("local", "rain-name");
      return typeof saved === "string" ? saved.slice(0, 20) : "";
    }),
    [code, setCode] = useState(initialCode),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hud, setHud] = useState<Game>(() => structuredClone(initialGame)),
    [help, setHelp] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [rejectedName, setRejectedName] = useState<string | null>(null);
  const nameReview = useMemo(
    () =>
      name === rejectedName
        ? { ok: false as const, error: NAME_REJECTED }
        : reviewNameFormat(name),
    [name, rejectedName],
  );
  function acceptName() {
    setNameTouched(true);
    if (nameReview.ok) return true;
    setError(nameReview.error);
    nameInput.current?.focus();
    return false;
  }
  function reportEntryError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === NAME_REJECTED) {
      // Associate the response with the submitted name, not a later edit.
      setRejectedName(name);
      nameInput.current?.focus();
    }
    setError(message);
  }
  const [guideEnabled, setGuideEnabled] = useState(
    () => stored<boolean>("local", "rain-guide") !== false,
  );
  const [helpLesson, setHelpLesson] = useState<Lesson>("basics");
  const helpRef = useRef(help);
  helpRef.current = help || (compact && (toolsOpen || mapOpen));
  useEffect(() => {
    save("local", "rain-guide", guideEnabled);
  }, [guideEnabled]);
  function clearControls() {
    keyboardInput.current.clear();
    touchInput.current.clear();
    input.current = idleInput();
  }
  function learn(lesson: Lesson) {
    setToolsOpen(false);
    setMapOpen(false);
    clearControls();
    if (currentSession.current && phaseRef.current === "game")
      roomSession.sendInput(game.current.id, input.current);
    setHelpLesson(lesson);
    setHelp(true);
  }
  const audio = useGameAudio(phase === "game");
  function sound(freq: number) {
    audio.effect(freq);
  }
  function changePhase(p: AppPhase) {
    phaseRef.current = p;
    setPhase(p);
    clearControls();
    setToolsOpen(false);
    setMapOpen(false);
  }
  function toggleMobilePanel(panel: "tools" | "map") {
    clearControls();
    if (currentSession.current)
      roomSession.sendInput(game.current.id, input.current);
    if (panel === "tools") {
      setToolsOpen((v) => !v);
      setMapOpen(false);
    } else {
      setMapOpen((v) => !v);
      setToolsOpen(false);
    }
  }
  useEffect(() => {
    if (phase === "game") {
      // Starting after a scrolled lobby must not leave the fixed play surface
      // below the viewport. Menus continue to scroll normally.
      window.scrollTo(0, 0);
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [phase]);
  function receive(r: PublicRoom) {
    const previous = game.current;
    setLevel(r.level);
    if (r.game) {
      if (
        r.game.keys.length > previous.keys.length ||
        r.game.stars.length > previous.stars.length
      )
        sound(660);
      // A WebSocket packet owns this snapshot; prediction clones before stepping.
      game.current = r.game;
      if (r.game.id !== previous.id) {
        resetRunControls();
        setCompletion(null);
      }
      recordWin(r.game);
      if (r.game.id !== previous.id || r.game.status !== previous.status)
        setHud(structuredClone(r.game));
    }
    if (r.phase !== phaseRef.current) changePhase(r.phase);
  }
  const roomSession = useRoomSession({
    initialCode,
    onRoom: receive,
    onEnter: () => {
      warmScene();
      changePhase("lobby");
    },
    onError: setError,
  });
  const { room, session, connected, currentRoom, currentSession } = roomSession;
  const { sceneStatus, sceneReady, guide } = useGameRuntime({
    phase,
    phaseRef,
    canvas,
    game,
    controls: { value: input, keyboard: keyboardInput, touch: touchInput },
    room: roomSession,
    presentation: {
      paused: helpRef.current,
      language,
      compact,
      guideEnabled,
      quality,
    },
    onStep: (g, value) => replay.record(g, value),
    onPickup: () => sound(660),
    onFrame: (g) => {
      if (!currentSession.current) recordWin(g);
      for (const cue of audioEvents.current.observe(g)) audio.cue(cue);
    },
    onHud: setHud,
  });
  const syncInput = () => {
    input.current =
      helpRef.current || !sceneReady.current
        ? idleInput()
        : mergeInput(
            keyboardInput.current.read(performance.now()),
            touchInput.current.read(performance.now()),
          );
    if (phaseRef.current === "game" && currentSession.current)
      roomSession.sendInput(game.current.id, input.current);
  };
  useEffect(
    () =>
      bindGameKeyboard(keyboardInput.current, {
        enabled: () =>
          phaseRef.current === "game" && sceneReady.current && !helpRef.current,
        escape: () => {
          if (phaseRef.current === "game") setHelp((v) => !v);
        },
        clear: () => touchInput.current.clear(),
        jump: () => sound(280),
        restart: () => restart(false),
        change: syncInput,
      }),
    [],
  );
  async function create() {
    if (!MINITOOL && !acceptName()) return;
    roomSession.beginEntry();
    warmScene();
    void audio.start();
    setError("");
    save("local", "rain-name", name);
    if (MINITOOL || mode === 1) {
      soloName.current = nameReview.ok ? nameReview.name : "旅人";
      roomSession.clear();
      game.current = newGame(1, level, crypto.randomUUID());
      setHud(structuredClone(game.current));
      changePhase("game");
      return;
    }
    setBusy(true);
    try {
      const r = await api("/rooms", {
        capacity: mode,
        level,
        name,
        playerToken,
      });
      roomSession.enter({ code: r.room.code, token: r.token, slot: r.slot });
    } catch (e) {
      reportEntryError(e);
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    if (!acceptName()) return;
    roomSession.beginEntry();
    warmScene();
    void audio.start();
    setBusy(true);
    setError("");
    save("local", "rain-name", name);
    try {
      const c = code.toUpperCase().trim();
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(c)) throw new Error("请输入 8 位房间码");
      const r = await api(`/rooms/${c}/join`, { name, playerToken });
      roomSession.enter({ code: c, token: r.token, slot: r.slot });
    } catch (e) {
      reportEntryError(e);
    } finally {
      setBusy(false);
    }
  }
  function leave() {
    roomSession.leave();
    setError("");
    setHelp(false);
    game.current = newGame(1, level);
    changePhase("menu");
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  function resetRunControls() {
    clearControls();
    helpRef.current = false;
    setHelp(false);
    setToolsOpen(false);
    setMapOpen(false);
  }
  function restart(next = false) {
    if (phaseRef.current !== "game") return;
    // The keyboard listener is installed once, so use the current session refs.
    const activeSession = currentSession.current;
    const activeRoom = currentRoom.current;
    if (
      activeSession &&
      (activeRoom?.votes.includes(activeSession.slot) ||
        (activeRoom?.voteNext != null && activeRoom.voteNext !== next))
    )
      return;
    resetRunControls();
    if (activeSession) {
      roomSession.sendInput(game.current.id, input.current);
      roomSession.command({
        type: "restart",
        gameId: game.current.id,
        next,
      });
    } else {
      const l = next
        ? (game.current.level + 1) % LEVELS.length
        : game.current.level;
      setLevel(l);
      game.current = newGame(1, l, crypto.randomUUID());
      setCompletion(null);
      setHud(structuredClone(game.current));
    }
  }
  async function retryTeamScore() {
    const s = currentSession.current;
    if (!s || retryingTeamScore) return;
    setRetryingTeamScore(true);
    try {
      const result = await api(`/rooms/${s.code}/score`, {}, s.token);
      if (currentSession.current === s) roomSession.refresh(result.room);
    } catch {
      setError("成绩暂未上传，请稍后重试。");
    } finally {
      setRetryingTeamScore(false);
    }
  }
  async function copyInvite() {
    if (MINITOOL) return;
    const u = new URL(location.href);
    u.search = `?room=${session?.code}`;
    try {
      await navigator.clipboard.writeText(u.href);
      setError("邀请链接已复制");
    } catch {
      setError(`${t("分享房间码")}: ${session?.code}`);
    }
  }
  const l = LEVELS[hud.level],
    local = hud.players[session?.slot ?? 0] ?? hud.players[0],
    isPlaying = phase === "game",
    won = isPlaying && hud.status === "won";
  const selectedBest = bestTimeFor(bestTimes, level, mode);
  const finish = completion?.gameId === hud.id ? completion : null;
  const rankingStatus = session
    ? (room?.rankingStatus ?? "pending")
    : ranking.result?.id === hud.id
      ? ranking.result.status
      : "pending";
  const restartBlocked =
    !!session &&
    (!connected ||
      !!room?.votes.includes(session.slot) ||
      room?.voteNext === true);
  const restartLabel = t(session ? "发起重开投票" : "快速重开");
  const restartHint = t(
    "重开本关：回到出生点，清空计时、钥匙、星星和本关存档。最佳纪录保留。",
  );
  const touch = (
    field: TouchField,
    value: number | boolean,
    label: string,
    hint?: string,
  ) => (
    <button
      className={`touch-key touch-${field} ${input.current[field] === value ? "held" : ""}`}
      aria-label={
        field === "axis" ? t(value === -1 ? "向左移动" : "向右移动") : label
      }
      aria-pressed={input.current[field] === value}
      disabled={!sceneReady.current || helpRef.current || won}
      title={
        field === "reset"
          ? t("返回最近许愿架，未存档物品复位。湿度清零，耐折不会重置。")
          : undefined
      }
      data-touch-field={field}
      data-touch-value={String(value)}
    >
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </button>
  );
  useEffect(() => {
    if (touchRoot.current)
      return bindTouchControls(
        touchRoot.current,
        touchInput.current,
        syncInput,
      );
  }, [isPlaying]);
  return (
    <main
      className={`app ${MINITOOL ? "minitool" : ""} ${isPlaying ? "playing" : ""} ${compact ? "compact" : ""} ${toolsOpen ? "tools-open" : ""} ${mapOpen ? "map-open" : ""} ${guideEnabled ? "with-guide" : ""}`}
      lang={language === "zh" ? "zh-CN" : "en"}
      translate="no"
    >
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label={t("千纸鹤横版游戏场景")}
        hidden={!isPlaying}
      />
      {isPlaying && sceneStatus !== "ready" && (
        <div className="scene-loading" role="status">
          <p>
            {t(
              sceneStatus === "context-lost"
                ? "画面暂时中断，正在恢复…"
                : sceneStatus === "context-failed"
                  ? "画面恢复失败，请重新加载。"
                  : sceneStatus === "error"
                    ? "场景加载失败，请重新加载。"
                    : "正在铺开雨中小径…",
            )}
          </p>
          {(sceneStatus === "error" || sceneStatus === "context-failed") && (
            <button onClick={() => location.reload()}>{t("重新加载")}</button>
          )}
        </div>
      )}
      <div className="atmosphere" />
      <div className="grain" />
      {compact && isPlaying && (toolsOpen || mapOpen) && (
        <button
          className="mobile-panel-backdrop"
          aria-label={t("收起")}
          onClick={() => {
            setToolsOpen(false);
            setMapOpen(false);
          }}
        />
      )}
      <header className="brand">
        <span className="brand-icon">{t("祈愿")}</span>
        <div>
          {t("雨停之前")}
          <small>{t("纸上祈愿")}</small>
        </div>
        <span className="edition">{t("纸鹤 · 许愿架 · 雨中归途")}</span>
      </header>
      {compact && isPlaying && (
        <nav className="mobile-toolbar" aria-label={t("游戏工具")}>
          <button
            aria-expanded={mapOpen}
            aria-controls="route-map"
            onClick={() => toggleMobilePanel("map")}
          >
            {t("路线")}
          </button>
          <button onClick={() => learn(guide.current?.lesson ?? "basics")}>
            {t("帮助")}
          </button>
          <button
            aria-expanded={toolsOpen}
            aria-controls="game-tools"
            onClick={() => toggleMobilePanel("tools")}
          >
            {t(toolsOpen ? "收起" : "菜单")}
          </button>
        </nav>
      )}
      <nav className="tools" id="game-tools">
        <button
          className="language"
          aria-label={t("切换语言")}
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
        >
          中文 / EN
        </button>
        <MusicControls audio={audio} language={language} />
        <QualityControls
          value={quality}
          onChange={setQuality}
          language={language}
        />
        {session && room && (
          <TeamControls
            room={room}
            slot={session.slot}
            connected={connected}
            language={language}
            send={(cmd) => roomSession.command(cmd)}
          />
        )}
        <button
          aria-label={t("切换玩法引导")}
          aria-pressed={guideEnabled}
          onClick={() => setGuideEnabled((v) => !v)}
        >
          {t(guideEnabled ? "引导开" : "引导关")}
        </button>
        <button onClick={() => (help ? setHelp(false) : learn("basics"))}>
          {t("操作说明")}
        </button>
        {isPlaying && (
          <>
            <SafeRestartButton
              language={language}
              scopeKey={hud.id}
              needsConfirmation={
                hud.time > 2 || hud.keys.length > 0 || hud.stars.length > 0
              }
              onConfirm={() => restart(false)}
              disabled={restartBlocked || !sceneReady.current}
              title={restartHint}
            >
              {restartLabel} · T
            </SafeRestartButton>
            <button onClick={leave}>{t("返回大厅")}</button>
          </>
        )}
      </nav>
      {error && (
        <div role="alert" className="toast" onClick={() => setError("")}>
          {t(error)}
          <span>×</span>
        </div>
      )}
      {phase === "menu" && (
        <>
          <div className="intro">
            <div className="intro-title">
              <h1>{t("雨停之前")}</h1>
              <p className="intro-dedication">{t("愿你平安抵达。")}</p>
            </div>
            <div className="intro-story">
              <p>
                {t("一张纸，一个愿望。")}
                <br />
                {t(
                  MINITOOL
                    ? "在雨幕与许愿架之间，带着愿望前行。"
                    : "在雨幕与许愿架之间，替同伴留一片干燥。",
                )}
              </p>
              <span className="intro-players">
                {t(
                  MINITOOL
                    ? "单人探索 · 40 段雨中旅途"
                    : "1 / 2 / 3 / 6 人 · 纸上合作冒险",
                )}
              </span>
              <GoalFlow language={language} soloOnly={MINITOOL} />
              <div className="intro-controls">
                <kbd>{t("空格")}</kbd> {t("起飞")} <kbd>Q</kbd> {t("转面")}{" "}
                <kbd>S</kbd> {t("展纸挡雨")}
              </div>
            </div>
          </div>
          <section className="panel menu">
            <div className="panel-top">
              <span>{t("启程挂签")}</span>
              <b>
                {LEVELS.length} {t("个关卡")}
              </b>
            </div>
            <div className="chapter-field">
              <span>{t("出发关卡")}</span>
              <RainSelect
                className="chapter-select"
                label={t("出发关卡")}
                value={String(level)}
                onChange={(value) => {
                  const n = Number(value);
                  setLevel(n);
                  game.current = newGame(1, n);
                }}
                options={LEVELS.map((l, i) => ({
                  value: String(i),
                  label: `${String(i + 1).padStart(2, "0")} · ${t(l.name)}`,
                  detail:
                    bestTimeFor(bestTimes, i, mode) !== undefined
                      ? formatTime(bestTimeFor(bestTimes, i, mode)!)
                      : undefined,
                }))}
              />
            </div>
            <div className="chapter-brief">
              {level >= 8 && (
                <strong className="challenge-label">
                  {t("挑战关 · 熟练后再来")}
                </strong>
              )}
              <p className="chapter-sub">{t(LEVELS[level].sub)}</p>
              <p>
                {compact
                  ? touchCopy(t(LEVELS[level].hint), language)
                  : t(LEVELS[level].hint)}
              </p>
              <button onClick={() => learn("basics")}>
                {t("第一次玩？先看图解")} ↗
              </button>
            </div>
            {!MINITOOL && (
              <>
                <label>
                  {t("你的名字")}
                  <input
                    ref={nameInput}
                    value={name}
                    maxLength={NAME_LIMIT}
                    placeholder={t("旅人")}
                    aria-invalid={nameTouched && !nameReview.ok}
                    aria-describedby="nickname-hint"
                    onBlur={() => setNameTouched(true)}
                    onChange={(e) => {
                      setName(e.target.value);
                      setRejectedName(null);
                      if (error === NAME_REJECTED || error === NAME_TOO_LONG)
                        setError("");
                    }}
                  />
                </label>
                <small
                  id="nickname-hint"
                  className={`ranking-name-hint${nameTouched && !nameReview.ok ? " name-error" : ""}`}
                  role="status"
                >
                  {t(
                    nameTouched && !nameReview.ok
                      ? nameReview.error
                      : "昵称会公开显示，请使用友善的名字。",
                  )}
                </small>
                <label>{t("同行人数")}</label>
                <div className="modes">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      className={mode === m ? "selected" : ""}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      <strong>{m}</strong>
                      <span>{t(m === 1 ? "独自探索" : "好友联机")}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              className="primary"
              disabled={busy}
              onPointerEnter={warmScene}
              onFocus={warmScene}
              onClick={create}
            >
              {t(busy ? "正在连接…" : mode === 1 ? "开始冒险" : "创建好友房间")}
              <span>↗</span>
            </button>
            {!MINITOOL && (
              <>
                <div className="separator">{t("已有同伴在等你")}</div>
                <div className="join">
                  <input
                    aria-label={t("房间码")}
                    maxLength={8}
                    placeholder={t("输入 8 位房间码")}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  <button disabled={busy} onClick={join}>
                    {t("加入 →")}
                  </button>
                </div>
                <p className="fine">
                  {t("每人一只纸鹤 · 用房间码邀请好友 · 不需要注册")}
                </p>
              </>
            )}
            <details className="journey-records">
              <summary>
                {t(MINITOOL ? "本地通关记录" : "通关记录与排行榜")}
              </summary>
              <div className="chapter-record" aria-label={t("本关通关记录")}>
                <div>
                  <span>
                    {t("本地最佳")} · {mode} {t("人")}
                  </span>
                  <strong>
                    {selectedBest === undefined
                      ? t("暂无通关记录")
                      : formatTime(selectedBest)}
                  </strong>
                </div>
                <small>
                  {t(
                    MINITOOL
                      ? "全星通关才计入记录 · 仅保存在此设备"
                      : "全星通关才计入记录 · 按人数分别记录",
                  )}
                </small>
              </div>
              {!MINITOOL && (
                <Leaderboard level={level} mode={mode} language={language} />
              )}
            </details>
          </section>
          <footer>
            {t(
              MINITOOL
                ? "把愿望系在檐下，沿着灯火归家。"
                : "把愿望系在檐下，把同伴带回家。",
            )}
            <span>{t("纸鹤 · 许愿架 · 雨中归途")}</span>
          </footer>
        </>
      )}
      {!MINITOOL && phase === "lobby" && room && (
        <section className="panel lobby">
          <span className="eyebrow">{t("等同伴系好愿望，一起出发")}</span>
          <h2>{t(LEVELS[room.level].name)}</h2>
          <GoalFlow language={language} soloOnly={MINITOOL} />
          <p className="lobby-guide">
            {t(LEVELS[room.level].hint)}{" "}
            <button
              onClick={() => learn(CROSSINGS[room.level] ? "bridge" : "turn")}
            >
              {t("出发前看图解")} ↗
            </button>
          </p>
          <div className="room-code">
            <div>
              <small>{t("房间码")}</small>
              <strong>{room.code}</strong>
            </div>
            <button onClick={copyInvite}>{t("复制邀请 ↗")}</button>
          </div>
          <div className="seats">
            {Array.from({ length: room.capacity }, (_, i) => {
              const p = room.players.find((x) => x.slot === i);
              return (
                <div key={i} className="seat">
                  <span style={{ color: COLORS[i] }}>◇</span>
                  <div>
                    {p
                      ? p.name === "旅人"
                        ? t("旅人")
                        : p.name
                      : t("等待同伴")}
                    <small>
                      {t(
                        p
                          ? p.online
                            ? "已连接"
                            : "连接中…"
                          : "分享房间码邀请加入",
                      )}
                    </small>
                  </div>
                  {p?.slot === session?.slot && <b>{t("你")}</b>}
                  {p?.slot === room.host && <em>{t("房主")}</em>}
                </div>
              );
            })}
          </div>
          <p className="fine">
            {t("每个人独立移动和跳跃。Q 会为全队转动视角，先和同伴商量。")}
          </p>
          <button
            className="primary"
            disabled={
              !connected ||
              room.players.length !== room.capacity ||
              room.players.some((p) => !p.online) ||
              session?.slot !== room.host
            }
            onClick={() => roomSession.command({ type: "start" })}
          >
            {session?.slot === room.host
              ? `${t("一起出发")} (${room.players.filter((p) => p.online).length}/${room.capacity})`
              : t("等待房主开始")}
            <span>→</span>
          </button>
          <button className="text-button" onClick={leave}>
            {t("离开房间")}
          </button>
        </section>
      )}
      {isPlaying && (
        <>
          <GameStatus
            game={hud}
            slot={session?.slot ?? 0}
            language={language}
            compact={compact}
            guide={guideEnabled ? guide.current : undefined}
            onLearn={learn}
            paused={helpRef.current}
            multiplayer={!!session}
            connected={connected}
            room={room}
          />
          <RouteMap
            game={hud}
            slot={session?.slot ?? 0}
            language={language}
            compact={compact}
            guide={guideEnabled ? guide.current : undefined}
            onClose={() => setMapOpen(false)}
          />
          <div className="bottom-hint">
            <kbd>← →</kbd>
            {t("移动")}
            <kbd>{t("空格")}</kbd>
            {t("跳 / 按住滑翔")}
            <kbd>Q</kbd>
            {t("转动")}
            <kbd>S / ↓</kbd>
            {t("展纸挡雨")}
            <kbd>Shift / B</kbd>
            {t("纸桥")}
            <kbd>F</kbd>
            {t("修补")}
            <kbd>R</kbd>
            {t("回存档")}
            <kbd>T</kbd>
            {t("快速重开")}
          </div>
          <div
            ref={touchRoot}
            className="touch-controls"
            aria-label={t("触控操作")}
          >
            <div className="touch-movement">
              {touch("reset", true, t("回存档"))}
              <SafeRestartButton
                language={language}
                scopeKey={hud.id}
                needsConfirmation={
                  hud.time > 2 || hud.keys.length > 0 || hud.stars.length > 0
                }
                className="touch-key touch-restart"
                onConfirm={() => restart(false)}
                aria-label={restartLabel}
                title={restartHint}
                disabled={
                  restartBlocked ||
                  !sceneReady.current ||
                  helpRef.current ||
                  won
                }
              >
                <span>{t("重开")}</span>
              </SafeRestartButton>
              {touch("axis", -1, "←")}
              {touch("axis", 1, "→")}
            </div>
            <div className="touch-actions">
              {touch("turn", true, t("转面"), t("点一下"))}
              {touch("fold", true, t("纸桥"), t("按住"))}
              {touch("shelter", true, t("挡雨"), t("按住"))}
              {touch("repair", true, t("修补"), t("按住"))}
              {touch("jump", true, t("跳跃"), t("按住滑翔"))}
            </div>
          </div>
          {local.arrived && !won && (
            <div className="waiting">
              {t("你已抵达，等同伴一起到家")} ·{" "}
              {hud.players.filter((p) => p.arrived).length}/{hud.mode}
            </div>
          )}
          {session && room?.players.some((p) => !p.online) && (
            <div className="waiting">
              {t("等待同伴重连，关卡已暂停")}
              <small style={{ display: "block" }}>
                {language === "en"
                  ? "Use Team in the menu to regroup."
                  : "可在菜单的「同伴」中重新组队"}
              </small>
            </div>
          )}
          {room && room.votes.length > 0 && (
            <div className="vote">
              {t(room.voteNext ? "下一关" : "重新开始")} · {room.votes.length}/
              {room.capacity} {t("人同意")}{" "}
              <button
                onClick={() => restart(room.voteNext ?? false)}
                disabled={room.votes.includes(session?.slot ?? -1)}
              >
                {t("我也同意")}
              </button>
            </div>
          )}
        </>
      )}
      {won && (
        <div className="scrim">
          <section className="panel win">
            <span className="eyebrow">{t("所有愿望，都到家了")}</span>
            <div className="big-star">✦</div>
            <h2>
              {t(MINITOOL ? "这一程，平安抵达。" : "这一程，我们一起走过。")}
            </h2>
            <p>
              {t(l.name)} · {hud.flips} {t("次转面")}
            </p>
            {!rankedClear(hud) && (
              <div className="finish-record">
                <p>
                  {t("本次用时")} · {formatTime(Math.round(hud.time * 1000))}
                </p>
                <p role="status">
                  {t(
                    MINITOOL
                      ? "未收齐星星：本次通关不计入本地记录。"
                      : "未收齐星星：本次通关不计入记录，也不会上传排行榜。",
                  )}
                </p>
              </div>
            )}
            {finish && (
              <div
                className={`finish-record ${finish.improved ? "new-best" : ""}`}
              >
                <dl>
                  <div>
                    <dt>{t("本次用时")}</dt>
                    <dd>{formatTime(finish.timeMs)}</dd>
                  </div>
                  <div>
                    <dt>
                      {t("本地最佳")} · {hud.mode} {t("人")}
                    </dt>
                    <dd>{formatTime(finish.bestMs)}</dd>
                  </div>
                </dl>
                <p className="record-result" role="status">
                  {t(
                    finish.improved
                      ? finish.previousMs === undefined
                        ? "首次通关记录"
                        : "刷新最佳纪录！"
                      : finish.timeMs === finish.bestMs
                        ? "追平最佳纪录"
                        : "最佳纪录已保留",
                  )}
                  {finish.improved &&
                    finish.previousMs !== undefined &&
                    (finish.previousMs - finish.timeMs < 100
                      ? ` · ${t("提升不足 0.1 秒")}`
                      : ` · ${t("快了")} ${formatTime(finish.previousMs - finish.timeMs)}`)}
                </p>
                <small>
                  {t(
                    finish.persisted
                      ? "已保存在此浏览器"
                      : "浏览器未能保存，记录仅本次有效",
                  )}
                </small>
              </div>
            )}
            {!MINITOOL && rankedClear(hud) && (
              <div className="ranking-upload" role="status">
                {t(
                  rankingStatus === "saved"
                    ? "成绩已核验，榜单已更新。"
                    : rankingStatus === "retry"
                      ? "成绩暂未上传，请稍后重试。"
                      : rankingStatus === "outdated"
                        ? "玩法已更新，请刷新后重新挑战。本地成绩已保留。"
                        : rankingStatus === "name-rejected"
                          ? "昵称未通过审核，本地成绩已保留。可使用「旅人」重新上传。"
                          : rankingStatus === "rejected"
                            ? "成绩未通过核验，仅保留本地成绩。"
                            : rankingStatus === "unavailable"
                              ? "本次过程记录不完整，仅保留本地成绩。"
                              : "正在核验并上传成绩…",
                )}
                {rankingStatus === "retry" && (
                  <button
                    disabled={retryingTeamScore}
                    onClick={session ? retryTeamScore : ranking.retry}
                  >
                    {t("重试上传")}
                  </button>
                )}
                {rankingStatus === "name-rejected" && (
                  <button
                    onClick={() => {
                      soloName.current = "旅人";
                      setName("旅人");
                      save("local", "rain-name", "旅人");
                      ranking.retryAsTraveler();
                    }}
                  >
                    {t("使用「旅人」重新上传")}
                  </button>
                )}
              </div>
            )}
            {!MINITOOL && (
              <Leaderboard
                level={hud.level}
                mode={hud.mode}
                language={language}
                refresh={`${hud.id}:${rankingStatus === "saved"}`}
              />
            )}
            <div className="score">
              {"✦".repeat(hud.stars.length)}
              <span>
                {"✧".repeat(Math.max(0, l.stars.length - hud.stars.length))}
              </span>
            </div>
            <p className="fine">
              {hud.players.reduce((sum, p) => sum + p.deaths, 0)}{" "}
              {t("次重新起飞")} · {hud.mode} {t("只纸鹤平安抵达")}
            </p>
            <p className="fine">{t("计时包含死亡重试，关卡暂停时不计时。")}</p>
            <button
              className="primary"
              onClick={() => restart(true)}
              disabled={
                !!session &&
                (!connected ||
                  !!room?.votes.includes(session.slot) ||
                  room?.voteNext === false)
              }
            >
              {t(
                hud.level === LEVELS.length - 1
                  ? "再来一趟"
                  : "下一阵风 · 下一关",
              )}
              <span>→</span>
            </button>
            {session && (
              <p className="fine">
                {t(
                  room?.voteNext === false
                    ? "全员同意后重开"
                    : "全员同意后出发",
                )}{" "}
                · {room?.votes.length ?? 0}/{hud.mode}
              </p>
            )}
            <button
              className="text-button"
              onClick={() => restart(false)}
              disabled={restartBlocked}
              title={restartHint}
            >
              {restartLabel} · T
            </button>
            <button className="text-button" onClick={leave}>
              {t("返回大厅")}
            </button>
          </section>
        </div>
      )}
      {help && (
        <div className="scrim">
          <section className="panel help">
            <button
              className="close"
              aria-label={t("关闭说明")}
              onClick={() => setHelp(false)}
            >
              ×
            </button>
            <HowToPlay
              language={language}
              initialLesson={helpLesson}
              soloOnly={MINITOOL}
              freeCheckpoints={isPlaying && !!LEVELS[hud.level].freeCheckpoints}
              playing={isPlaying}
              multiplayer={!!session}
              compact={compact}
            />
            {isPlaying && (
              <>
                <SafeRestartButton
                  className="primary"
                  language={language}
                  scopeKey={hud.id}
                  needsConfirmation={
                    hud.time > 2 || hud.keys.length > 0 || hud.stars.length > 0
                  }
                  onConfirm={() => restart(false)}
                  disabled={restartBlocked || !sceneReady.current}
                  title={restartHint}
                >
                  {t(session ? "发起重开投票" : "重新开始本关")}
                </SafeRestartButton>
                <p className="fine">{restartHint}</p>
              </>
            )}
            <button className="text-button" onClick={() => setHelp(false)}>
              {t("继续冒险")}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
