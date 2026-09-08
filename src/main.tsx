import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LEVELS,
  MAX_FOLDS,
  REPAIR_SECONDS,
  atRepairRack,
  MODES,
  COLORS,
  NAMES,
  idleInput,
  newGame,
  stepGame,
  type Game,
  type Input,
  type Inputs,
  type Mode,
} from "./game";
import { api, Connection, validSession, type Session } from "./api";
import { save, stored, forget } from "./storage";
import { KeyboardInput, bindGameKeyboard } from "./keyboard-input";
import type { PublicRoom } from "./room";
import type { PaperScene } from "./scene";
import { loadScene, warmScene } from "./scene-loader";
import { FrameBudget } from "./frame-budget";
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
import { TouchInput, mergeInput, type TouchField } from "./touch-input";
import { useCompactControls, touchCopy } from "./mobile";
import { useGameAudio, MusicControls } from "./audio";
import { translate, type Language } from "./i18n";
import { CROSSINGS } from "./bridges";
import { FIRE_WARNING, CAMPFIRES } from "./weather";
import {
  guideFor,
  newGuideTracker,
  GUIDE_ROUTES,
  words,
  type Lesson,
} from "./guide";
import { GuideCard, HowToPlay, GoalFlow } from "./guide-ui";
const KEY = "rain-action-session-v2";
const initialCode = new URLSearchParams(location.search).get("room") ?? "";
function App() {
  const compact = useCompactControls();
  const statusSidebar = useRef<HTMLDivElement>(null);
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() =>
    stored<string>("local", "rain-language") === "en" ? "en" : "zh",
  );
  const languageRef = useRef(language);
  languageRef.current = language;
  const t = (text: string) => translate(language, text);
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
      if (g.mode === 1) {
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
  const [sceneStatus, setSceneStatus] = useState("idle");
  const sceneReady = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<Game>(initialGame),
    input = useRef<Input>(idleInput()),
    keyboardInput = useRef(new KeyboardInput()),
    touchInput = useRef(new TouchInput()),
    others = useRef<Inputs>({}),
    connection = useRef<Connection | null>(null),
    currentRoom = useRef<PublicRoom | null>(null),
    currentSession = useRef<Session | null>(null),
    phaseRef = useRef("menu"),
    authTime = useRef(0),
    sessionAttempt = useRef(0);
  const [phase, setPhase] = useState("menu"),
    [mode, setMode] = useState<Mode>(1),
    [level, setLevel] = useState(0),
    [name, setName] = useState(() => {
      const saved = stored<unknown>("local", "rain-name");
      return typeof saved === "string" ? saved.slice(0, 20) : "";
    }),
    [code, setCode] = useState(initialCode),
    [room, setRoom] = useState<PublicRoom | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [connected, setConnected] = useState(false),
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
  const helpRef = useRef(help),
    guideEnabledRef = useRef(guideEnabled);
  helpRef.current = help || (compact && (toolsOpen || mapOpen));
  guideEnabledRef.current = guideEnabled;
  const guideTracker = useRef(newGuideTracker());
  const guide = useRef<ReturnType<typeof guideFor> | null>(null);
  if (!guide.current)
    guide.current = guideFor(game.current, 0, guideTracker.current);
  useEffect(() => {
    save("local", "rain-guide", guideEnabled);
  }, [guideEnabled]);
  function learn(lesson: Lesson) {
    setToolsOpen(false);
    setMapOpen(false);
    touchInput.current.clear();
    keyboardInput.current.clear();
    input.current = idleInput();
    if (currentSession.current && phaseRef.current === "game")
      connection.current?.input(game.current.id, input.current);
    setHelpLesson(lesson);
    setHelp(true);
  }
  const audio = useGameAudio(phase === "game");
  function sound(freq: number) {
    audio.effect(freq);
  }
  function changePhase(p: string) {
    phaseRef.current = p;
    setPhase(p);
    input.current = idleInput();
    keyboardInput.current.clear();
    touchInput.current.clear();
    setToolsOpen(false);
    setMapOpen(false);
  }
  function toggleMobilePanel(panel: "tools" | "map") {
    touchInput.current.clear();
    keyboardInput.current.clear();
    input.current = idleInput();
    if (currentSession.current)
      connection.current?.input(game.current.id, input.current);
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
  function receive(r: PublicRoom, ins: Inputs) {
    const previous = game.current;
    const previousRoom = currentRoom.current;
    currentRoom.current = r;
    others.current = ins;
    if (r.game) {
      if (
        r.game.keys.length > previous.keys.length ||
        r.game.stars.length > previous.stars.length
      )
        sound(660);
      // A WebSocket packet owns this snapshot; prediction clones before stepping.
      game.current = r.game;
      authTime.current = performance.now();
      if (r.game.id !== previous.id) {
        resetRunControls();
        setCompletion(null);
      }
      recordWin(r.game);
      if (r.game.id !== previous.id || r.game.status !== previous.status)
        setHud(structuredClone(r.game));
    }
    if (
      r.revision !== previousRoom?.revision ||
      r.phase !== previousRoom?.phase
    )
      setRoom(r);
    if (r.phase !== phaseRef.current) changePhase(r.phase);
  }
  function enter(s: Session) {
    sessionAttempt.current++;
    connection.current?.close();
    setConnected(false);
    currentSession.current = s;
    setSession(s);
    save("session", KEY, s);
    warmScene();
    changePhase("lobby");
    connection.current = new Connection(s, receive, setConnected, setError);
  }
  useEffect(() => {
    const attempt = sessionAttempt.current;
    let cancelled = false;
    const s = stored<unknown>("session", KEY);
    if (validSession(s) && (!initialCode || initialCode === s.code)) {
      void api(`/rooms/${s.code}`, undefined, s.token)
        .then(() => {
          if (!cancelled && attempt === sessionAttempt.current) enter(s);
        })
        .catch(() => {
          if (!cancelled && attempt === sessionAttempt.current)
            forget("session", KEY);
        });
    }
    return () => {
      cancelled = true;
      connection.current?.close();
    };
  }, []);
  useEffect(() => {
    if (phase !== "game") return;
    let cancelled = false,
      frame = 0,
      scene: PaperScene | null = null;
    sceneReady.current = false;
    setSceneStatus("loading");
    void loadScene()
      .then(({ PaperScene }) => {
        if (cancelled) return;
        const created = new PaperScene(canvas.current!);
        scene = created;
        sceneReady.current = true;
        setSceneStatus("ready");
        let last = performance.now(),
          acc = 0,
          net = 0,
          ui = 0,
          simulatedGameId = game.current.id;
        const budget = new FrameBudget();
        const update = (now: number) => {
          if (simulatedGameId !== game.current.id) {
            simulatedGameId = game.current.id;
            last = now;
            acc = 0;
            ui = 0;
          }
          if (document.hidden) {
            last = now;
            acc = 0;
            return;
          }
          if (
            !budget.ready(
              now,
              helpRef.current && !currentSession.current ? 30 : 60,
            )
          )
            return;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          acc += dt;
          const playing = phaseRef.current === "game";
          input.current = helpRef.current
            ? idleInput()
            : mergeInput(
                keyboardInput.current.read(now),
                touchInput.current.read(now),
              );
          if (playing) {
            if (!currentSession.current && helpRef.current) {
              acc = 0;
            } else if (!currentSession.current) {
              while (acc >= 1 / 60) {
                const before =
                  game.current.keys.length + game.current.stars.length;
                replay.record(game.current, input.current);
                stepGame(game.current, { 0: input.current });
                if (
                  game.current.keys.length + game.current.stars.length >
                  before
                )
                  sound(660);
                acc -= 1 / 60;
              }
            } else {
              acc = 0;
              if (now - net > 33) {
                connection.current?.input(game.current.id, input.current);
                net = now;
              }
            }
          } else acc = 0;
          if (!currentSession.current) recordWin(game.current);
          let display = game.current;
          if (
            playing &&
            currentSession.current &&
            currentRoom.current?.players.every((p) => p.online)
          ) {
            display = structuredClone(game.current);
            const predicted = Math.min(
              0.1,
              Math.max(0, (now - authTime.current) / 1000),
            );
            for (let t = 0; t < predicted; t += 1 / 60)
              stepGame(display, {
                ...others.current,
                [currentSession.current.slot]: input.current,
              });
          }
          guide.current = guideFor(
            game.current,
            currentSession.current?.slot ?? 0,
            guideTracker.current,
          );
          created.render(
            display,
            currentSession.current?.slot ?? 0,
            dt,
            phaseRef.current !== "game",
            languageRef.current,
            guideEnabledRef.current && playing
              ? guide.current.target
              : undefined,
            compactRef.current,
          );
          if (now - ui > 100) {
            setHud(structuredClone(game.current));
            ui = now;
          }
        };
        const loop = (now: number) => {
          if (cancelled) return;
          try {
            update(now);
          } catch {
            sceneReady.current = false;
            keyboardInput.current.clear();
            touchInput.current.clear();
            input.current = idleInput();
            connection.current?.input(game.current.id, input.current);
            setSceneStatus("error");
            return;
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!cancelled) setSceneStatus("error");
      });
    return () => {
      cancelled = true;
      sceneReady.current = false;
      cancelAnimationFrame(frame);
      scene?.dispose();
    };
  }, [phase]);
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
        change: () => {
          input.current = helpRef.current
            ? idleInput()
            : mergeInput(
                keyboardInput.current.read(performance.now()),
                touchInput.current.read(performance.now()),
              );
          if (phaseRef.current === "game" && currentSession.current)
            connection.current?.input(game.current.id, input.current);
        },
      }),
    [],
  );
  async function create() {
    if (!acceptName()) return;
    sessionAttempt.current++;
    warmScene();
    void audio.start();
    setError("");
    save("local", "rain-name", name);
    if (mode === 1) {
      soloName.current = nameReview.ok ? nameReview.name : "旅人";
      connection.current?.close();
      currentSession.current = null;
      currentRoom.current = null;
      setSession(null);
      setRoom(null);
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
      enter({ code: r.room.code, token: r.token!, slot: r.slot! });
    } catch (e) {
      reportEntryError(e);
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    if (!acceptName()) return;
    sessionAttempt.current++;
    warmScene();
    void audio.start();
    setBusy(true);
    setError("");
    save("local", "rain-name", name);
    try {
      const c = code.toUpperCase().trim();
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(c)) throw new Error("请输入 8 位房间码");
      const r = await api(`/rooms/${c}/join`, { name, playerToken });
      enter({ code: c, token: r.token!, slot: r.slot! });
    } catch (e) {
      reportEntryError(e);
    } finally {
      setBusy(false);
    }
  }
  function leave() {
    sessionAttempt.current++;
    setConnected(false);
    if (session && room?.phase === "lobby")
      void api(
        `/rooms/${session.code}/command`,
        { type: "leave" },
        session.token,
      ).catch(() => {});
    connection.current?.close();
    connection.current = null;
    currentSession.current = null;
    currentRoom.current = null;
    forget("session", KEY);
    setSession(null);
    setRoom(null);
    setError("");
    setHelp(false);
    game.current = newGame(1, level);
    changePhase("menu");
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  function resetRunControls() {
    keyboardInput.current.clear();
    touchInput.current.clear();
    input.current = idleInput();
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
      connection.current?.input(game.current.id, input.current);
      connection.current?.command({
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
      if (currentSession.current === s) receive(result.room, others.current);
    } catch {
      setError("成绩暂未上传，请稍后重试。");
    } finally {
      setRetryingTeamScore(false);
    }
  }
  async function copyInvite() {
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
  const { minX, maxX, minZ, maxZ } = useMemo(() => {
    const mapPlatforms = LEVELS[hud.level].platforms.filter(
      (p) => !["wall", "low-roof", "railing"].includes(p.kind ?? ""),
    );
    const minX =
      Math.min(
        ...mapPlatforms.map(
          (p) => p.x - p.w / 2 - (p.motion?.axis === "x" ? p.motion.range : 0),
        ),
      ) - 1.5;
    const maxX =
      Math.max(
        ...mapPlatforms.map(
          (p) => p.x + p.w / 2 + (p.motion?.axis === "x" ? p.motion.range : 0),
        ),
      ) + 1.5;
    const minZ =
      Math.min(
        ...mapPlatforms.map(
          (p) => p.z - p.d / 2 - (p.motion?.axis === "z" ? p.motion.range : 0),
        ),
      ) - 1.5;
    const maxZ =
      Math.max(
        ...mapPlatforms.map(
          (p) => p.z + p.d / 2 + (p.motion?.axis === "z" ? p.motion.range : 0),
        ),
      ) + 1.5;
    return { minX, maxX, minZ, maxZ };
  }, [hud.level]);
  const carriedKeys = local.carriedKeys?.length ?? 0,
    carriedStars = local.carriedStars?.length ?? 0;
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
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        touchInput.current.press(e.pointerId, field, value, performance.now());
      }}
      onPointerUp={(e) =>
        touchInput.current.release(e.pointerId, performance.now())
      }
      onPointerCancel={(e) => touchInput.current.cancel(e.pointerId)}
      onLostPointerCapture={(e) => touchInput.current.cancel(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </button>
  );
  useEffect(() => {
    const sidebar = statusSidebar.current;
    if (!sidebar) return;
    const observer = new ResizeObserver(() => {
      sidebar.parentElement?.style.setProperty(
        "--sidebar-height",
        `${Math.ceil(sidebar.getBoundingClientRect().height)}px`,
      );
    });
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [isPlaying, compact]);
  return (
    <main
      className={`app ${isPlaying ? "playing" : ""} ${compact ? "compact" : ""} ${toolsOpen ? "tools-open" : ""} ${mapOpen ? "map-open" : ""} ${guideEnabled ? "with-guide" : ""}`}
      lang={language === "zh" ? "zh-CN" : "en"}
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
              sceneStatus === "error"
                ? "场景加载失败，请重新加载。"
                : "正在铺开雨中小径…",
            )}
          </p>
          {sceneStatus === "error" && (
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
            <button
              onClick={() => restart(false)}
              disabled={restartBlocked || !sceneReady.current}
              title={restartHint}
            >
              {restartLabel} · T
            </button>
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
            <span className="eyebrow">
              {t("1 / 2 / 3 / 6 人 · 纸上合作冒险")}
            </span>
            <h1>
              <span>{t("雨停之前，")}</span>
              <span>{t("愿你平安抵达。")}</span>
            </h1>
            <p>
              {t("一张纸，一个愿望。")}
              <br />
              {t("在雨幕与许愿架之间，替同伴留一片干燥。")}
            </p>
            <div className="wish-tags" aria-hidden="true">
              <i>◇</i>
              <i>✦</i>
              <i>◇</i>
            </div>
            <GoalFlow language={language} />
            <div className="intro-controls">
              <kbd>{t("空格")}</kbd> {t("起飞")} <kbd>Q</kbd> {t("转面")}{" "}
              <kbd>S</kbd> {t("展纸挡雨")}
            </div>
          </div>
          <section className="panel menu">
            <div className="panel-top">
              <span>{t("启程挂签")}</span>
              <b>
                {LEVELS.length} {t("个关卡")}
              </b>
            </div>
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
                  onClick={() => setMode(m)}
                >
                  <strong>{m}</strong>
                  <span>{t(m === 1 ? "独自探索" : "好友联机")}</span>
                </button>
              ))}
            </div>
            <label>
              {t("出发关卡")}
              <select
                value={level}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setLevel(n);
                  game.current = newGame(1, n);
                }}
              >
                {LEVELS.map((l, i) => (
                  <option key={i} value={i}>
                    {String(i + 1).padStart(2, "0")} · {t(l.name)}
                    {bestTimeFor(bestTimes, i, mode) !== undefined &&
                      ` · ${formatTime(bestTimeFor(bestTimes, i, mode)!)}`}
                  </option>
                ))}
              </select>
            </label>
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
              <small>{t("仅保存在此浏览器 · 按人数分别记录")}</small>
            </div>
            <div className="chapter-brief">
              {level >= 8 && (
                <strong className="challenge-label">
                  {t("挑战关 · 熟练后再来")}
                </strong>
              )}
              <b>{t("本关练习")}</b>
              <p>
                {compact
                  ? touchCopy(t(LEVELS[level].hint), language)
                  : t(LEVELS[level].hint)}
              </p>
              <button onClick={() => learn("basics")}>
                {t("第一次玩？先看图解")} ↗
              </button>
            </div>
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
            <Leaderboard level={level} mode={mode} language={language} />
          </section>
          <footer>
            {t("把愿望系在檐下，把同伴带回家。")}
            <span>{t("纸鹤 · 许愿架 · 雨中归途")}</span>
          </footer>
        </>
      )}
      {phase === "lobby" && room && (
        <section className="panel lobby">
          <span className="eyebrow">{t("等同伴系好愿望，一起出发")}</span>
          <h2>{t(LEVELS[room.level].name)}</h2>
          <GoalFlow language={language} />
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
            onClick={() => connection.current?.command({ type: "start" })}
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
          <section className="hud">
            <div className="stage">
              <b>{String(hud.level + 1).padStart(2, "0")}</b>
              <div>
                {t(l.name)}
                <small>{t(l.sub)}</small>
              </div>
            </div>
            <div className="stats">
              <span>
                ⚿ {hud.keys.length}/{l.keys.length}
              </span>
              <span>
                ✦ {hud.stars.length}/{l.stars.length}
              </span>
              <span className="elapsed-time">
                ◷ {formatTime(Math.round(hud.time * 1000))}
              </span>
              {session && (
                <span className={connected ? "online" : "offline"}>
                  {t(connected ? "● 联机" : "● 重连中")}
                </span>
              )}
            </div>
          </section>
          <div className="status-sidebar" ref={statusSidebar}>
            <section
              className={`rain-hud ${(local.wetness ?? 0) > 70 ? "soaked" : ""}`}
              aria-label={t("纸鹤状态")}
            >
              <div className="wet-condition">
                <div className="meter-heading">
                  <span>{t(compact ? "湿度" : "纸的湿度")}</span>
                  <strong>
                    {Math.round(local.wetness ?? 0)}
                    <small>%</small>
                  </strong>
                </div>
                <div
                  className="wet-track"
                  role="progressbar"
                  aria-label={t("淋湿程度")}
                  aria-valuenow={Math.round(local.wetness ?? 0)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i style={{ width: `${local.wetness ?? 0}%` }} />
                </div>
                <p>
                  {t(
                    local.nearFire
                      ? "小火旁 · 正在烤干"
                      : local.rainCover === "roof"
                        ? "檐下只挡雨 · 靠近小火才能烤干"
                        : local.rainCover === "ally"
                          ? "同伴挡雨 · 湿度保持不变"
                          : local.sheltering
                            ? "展成方纸 · 自己仍会缓慢淋湿"
                            : local.rainCover === "rain"
                              ? "正在淋雨 · S 展纸 / 寻找屋檐"
                              : "无雨处 · 湿度保持不变",
                  )}
                </p>
              </div>
              <div
                className={`heat-condition ${(local.heat ?? 0) >= FIRE_WARNING ? "too-hot" : ""}`}
              >
                <div className="meter-heading">
                  <span>{t(compact ? "热度" : "烘烤程度")}</span>
                  <b>{Math.round(local.heat ?? 0)} / 100</b>
                </div>
                <div
                  className="heat-track"
                  role="progressbar"
                  aria-label={t("烘烤程度")}
                  aria-valuenow={Math.round(local.heat ?? 0)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i style={{ width: `${local.heat ?? 0}%` }} />
                </div>
                <p>
                  {t(
                    (local.heat ?? 0) >= FIRE_WARNING
                      ? "纸边正在变脆！快离开火堆"
                      : local.nearFire
                        ? (local.wetness ?? 0) < 1
                          ? "纸已经烤干，离开火边"
                          : "烤干就走 · 烘烤到 100 会碎裂"
                        : (local.heat ?? 0) > 0
                          ? "远离火堆 · 正在降温"
                          : "火光圈内可烤干 · 旺火不可接近",
                  )}
                </p>
              </div>
              <div
                className={`fold-condition ${(local.foldsLeft ?? MAX_FOLDS) <= 2 ? "fragile" : ""}`}
              >
                <div className="meter-heading">
                  <span>{t(compact ? "耐折" : "剩余耐折")}</span>
                  <b>
                    {local.foldsLeft ?? MAX_FOLDS} / {MAX_FOLDS}
                  </b>
                </div>
                <div
                  className="fold-pips"
                  role="meter"
                  aria-label={t("耐折次数")}
                  aria-valuenow={local.foldsLeft ?? MAX_FOLDS}
                  aria-valuemin={0}
                  aria-valuemax={MAX_FOLDS}
                >
                  {Array.from({ length: MAX_FOLDS }, (_, i) => (
                    <i
                      key={i}
                      className={
                        i < (local.foldsLeft ?? MAX_FOLDS) ? "intact" : "spent"
                      }
                    />
                  ))}
                </div>
                <p>
                  {t(
                    local.foldBlocked
                      ? local.foldsLeft === 0
                        ? "纸已破损，先去许愿架修补"
                        : "湿纸太脆，先晾干或修补"
                      : local.wetness >= 60
                        ? "湿度 ≥ 60%：每次消耗 2 格"
                        : "每次展纸或折桥消耗 1 格",
                  )}
                </p>
              </div>
              {atRepairRack(hud, local) ? (
                <div className="repair-hint">
                  <span>
                    {t(
                      local.repairProgress >= REPAIR_SECONDS
                        ? "修补完成"
                        : local.repairProgress > 0
                          ? "修补中"
                          : "按住 F · 修补纸张",
                    )}
                  </span>
                </div>
              ) : (
                <p className="repair-away">
                  {t("许愿架可修补 · R 返回存档处")}
                </p>
              )}
              {hud.mode > 1 && (
                <div className="team-wet">
                  {hud.players.map((p) => (
                    <span
                      key={p.id}
                      title={`${t(NAMES[p.id])}: ${Math.round(p.wetness ?? 0)}% · ${p.foldsLeft ?? MAX_FOLDS} ${t("折")}`}
                    >
                      <i style={{ background: COLORS[p.id] }} />
                      {p.arrived
                        ? t("已到家")
                        : `${Math.round(p.wetness ?? 0)}% / ${p.foldsLeft ?? MAX_FOLDS}${t("折")}`}
                      {(p.heat ?? 0) >= FIRE_WARNING
                        ? ` · ♨ ${Math.round(p.heat)}`
                        : ""}
                      {p.sheltering ? t(" · 挡雨") : ""}
                    </span>
                  ))}
                </div>
              )}
            </section>
            {guideEnabled && (
              <GuideCard
                g={hud}
                guide={guide.current}
                language={language}
                onLearn={learn}
                compact={compact}
              />
            )}
          </div>
          {compact && (
            <div
              className={`mobile-condition-note ${(local.heat ?? 0) >= FIRE_WARNING || local.foldBlocked ? "urgent" : ""}`}
              role="status"
            >
              {helpRef.current
                ? t(
                    session
                      ? "联机仍在进行，请在安全处查看"
                      : "已暂停 · 关闭面板继续",
                  )
                : (local.heat ?? 0) >= FIRE_WARNING
                  ? t("纸边正在变脆！快离开火堆")
                  : local.foldBlocked
                    ? t(
                        local.foldsLeft === 0
                          ? "纸已破损，先去许愿架修补"
                          : "湿纸太脆，先晾干或修补",
                      )
                    : local.nearFire
                      ? t(
                          local.wetness < 1
                            ? "纸已经烤干，离开火边"
                            : "小火旁 · 正在烤干",
                        )
                      : atRepairRack(hud, local)
                        ? t(
                            local.repairProgress >= REPAIR_SECONDS
                              ? "修补完成"
                              : local.repairProgress > 0
                                ? "修补中"
                                : "架旁按住「修补」恢复耐折",
                          )
                        : t("按住左右移动 · 按住跳跃滑翔")}
            </div>
          )}
          <div
            className={`carry-hud ${carriedKeys + carriedStars ? "pending" : ""}`}
            role="status"
          >
            {carriedKeys + carriedStars > 0 ? (
              <>
                <b>
                  {t("未存档")} · ⚿ {carriedKeys} · ✦ {carriedStars}
                </b>
                <span>{t("带到下一个许愿架 · 死亡后需重新拾取")}</span>
              </>
            ) : local.bankedUntil > hud.time ? (
              <>
                <b>
                  ⚑ {t("已存入许愿架")} · {local.lastBanked} {t("件物品")}
                </b>
                <span>{t("这部分收集，死亡后会保留")}</span>
              </>
            ) : (
              <span>
                ⚑ {t("已存档")} · ⚿ {hud.savedKeys?.length ?? 0} · ✦{" "}
                {hud.savedStars?.length ?? 0}
              </span>
            )}
          </div>
          {local.failureUntil > hud.time &&
            (local.lastDropped > 0 ||
              (local.lastFailure && local.lastFailure !== "fall")) && (
              <div className="failure-notice" role="alert">
                {t(
                  local.lastFailure === "scorched"
                    ? "碰到旺火，纸鹤烧毁了 · 已返回许愿架"
                    : local.lastFailure === "brittle"
                      ? "烤得太久，纸鹤脆裂了 · 已返回许愿架"
                      : local.lastFailure === "soaked"
                        ? "纸鹤湿透了 · 已返回许愿架"
                        : "已返回最近的许愿架",
                )}
                {local.lastDropped > 0 && (
                  <small>
                    {local.lastDropped} {t("件未存档物品已复位 · 请重新拾取")}
                  </small>
                )}
              </div>
            )}
          <aside className="compass" id="route-map">
            <div>
              <b>{t(hud.view === 0 ? "正面 · 左右" : "侧面 · 前后")}</b>
              {compact ? (
                <button
                  onClick={() => setMapOpen(false)}
                  aria-label={t("关闭路线图")}
                >
                  ×
                </button>
              ) : (
                <kbd>Q</kbd>
              )}
            </div>
            <svg
              viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}
              aria-label={t("俯视路线图")}
            >
              {l.platforms
                .filter(
                  (p) =>
                    p.kind !== "wall" &&
                    p.kind !== "low-roof" &&
                    p.kind !== "railing",
                )
                .map((p, i) => (
                  <rect
                    key={i}
                    x={p.x - p.w / 2}
                    y={p.z - p.d / 2}
                    width={p.w}
                    height={p.d}
                    rx=".2"
                    fill="#61758a"
                  />
                ))}
              {CROSSINGS[hud.level] && (
                <rect
                  x={
                    CROSSINGS[hud.level].x -
                    (CROSSINGS[hud.level].axis === "x" ? 1.3 : 0.5)
                  }
                  y={
                    CROSSINGS[hud.level].z -
                    (CROSSINGS[hud.level].axis === "z" ? 1.3 : 0.5)
                  }
                  width={CROSSINGS[hud.level].axis === "x" ? 2.6 : 1}
                  height={CROSSINGS[hud.level].axis === "z" ? 2.6 : 1}
                  fill={hud.bridgeLatched ? "#d9b66b" : "none"}
                  stroke="#d9b66b"
                  strokeWidth=".25"
                  strokeDasharray={hud.bridgeLatched ? undefined : ".4 .3"}
                />
              )}
              {guideEnabled && (
                <>
                  <polyline
                    points={GUIDE_ROUTES[hud.level]
                      .map((s) => `${s.target.x},${s.target.z}`)
                      .join(" ")}
                    fill="none"
                    stroke="#e8d0a1"
                    strokeWidth=".12"
                    strokeDasharray=".35 .35"
                    opacity=".45"
                  />
                  {l.keys.map(
                    (k, i) =>
                      !hud.keys.includes(i) && (
                        <text
                          key={`key-${i}`}
                          x={k.x}
                          y={k.z + 0.35}
                          textAnchor="middle"
                          fontSize="1.7"
                          fill="#ffe5a8"
                        >
                          ⚿
                        </text>
                      ),
                  )}
                  {l.checkpoints.map((c, i) => (
                    <rect
                      key={`rack-${i}`}
                      x={c.x - 0.35}
                      y={c.z - 0.35}
                      width=".7"
                      height=".7"
                      fill={local.checkpoint >= i ? "#b3dbbc" : "none"}
                      stroke="#b3dbbc"
                      strokeWidth=".15"
                    />
                  ))}
                  {CAMPFIRES[hud.level].map((c, i) => (
                    <circle
                      key={`fire-${i}`}
                      cx={c.x}
                      cy={c.z}
                      r=".22"
                      fill="#ef9a63"
                    />
                  ))}
                  {guide.current.target && (
                    <circle
                      className="map-guide-target"
                      cx={guide.current.target.x}
                      cy={guide.current.target.z}
                      r=".9"
                      fill="none"
                      stroke="#ffe5a8"
                      strokeWidth=".2"
                    />
                  )}
                </>
              )}
              <circle cx={l.exit.x} cy={l.exit.z} r=".8" fill="#d9b66b" />
              {hud.players.map((p) => (
                <circle
                  key={p.id}
                  cx={p.x}
                  cy={p.z}
                  r={p.id === local.id ? 0.75 : 0.55}
                  fill={COLORS[p.id]}
                  stroke="white"
                  strokeWidth=".2"
                />
              ))}
            </svg>
            {guideEnabled && (
              <div className="map-legend">
                {t("◎ 目标 · □ 存档 · 橙点小火")}
              </div>
            )}
            <div className="depth-legend">
              <i aria-hidden="true" />
              {words(
                ["亮边：当前行进层", "Bright edges: current lane"],
                language,
              )}
            </div>
            <small>
              {t("你是")} <i style={{ background: COLORS[local.id] }} />
              {t(NAMES[local.id])} ·{" "}
              {t(local.checkpoint >= 0 ? "已记录许愿架" : "起点")}
            </small>
          </aside>
          <div className="bottom-hint">
            <kbd>← →</kbd>
            {t("移动")}
            <kbd>{t("空格")}</kbd>
            {t("跳 / 按住滑翔")}
            <kbd>Q</kbd>
            {t("转动")}
            <kbd>S / ↓</kbd>
            {t("展纸挡雨")}
            <kbd>Shift</kbd>
            {t("纸桥")}
            <kbd>F</kbd>
            {t("修补")}
            <kbd>R</kbd>
            {t("回存档")}
            <kbd>T</kbd>
            {t("快速重开")}
          </div>
          <div className="touch-controls" aria-label={t("触控操作")}>
            <div className="touch-movement">
              {touch("reset", true, t("回存档"))}
              <button
                className="touch-key touch-restart"
                onClick={() => restart(false)}
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
              </button>
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
            <div className="waiting">{t("等待同伴重连，关卡已暂停")}</div>
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
            <h2>{t("这一程，我们一起走过。")}</h2>
            <p>
              {t(l.name)} · {hud.flips} {t("次转面")}
            </p>
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
            <Leaderboard
              level={hud.level}
              mode={hud.mode}
              language={language}
              refresh={`${hud.id}:${rankingStatus === "saved"}`}
            />
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
              playing={isPlaying}
              multiplayer={!!session}
              compact={compact}
            />
            {isPlaying && (
              <>
                <button
                  className="primary"
                  onClick={() => restart(false)}
                  disabled={restartBlocked}
                >
                  {t(session ? "发起重开投票" : "重新开始本关")}
                </button>
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
createRoot(document.getElementById("root")!).render(<App />);
