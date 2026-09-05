import React, { useEffect, useRef, useState } from "react";
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
import { api, Connection, save, stored, type Session } from "./api";
import type { PublicRoom } from "./room";
import { PaperScene } from "./scene";
import "./style.css";
import { useGameAudio, MusicControls } from "./audio";
import { translate, type Language } from "./i18n";
const KEY = "rain-action-session-v2";
const initialCode = new URLSearchParams(location.search).get("room") ?? "";
function App() {
  const [language, setLanguage] = useState<Language>(() =>
    stored<string>(localStorage, "rain-language") === "en" ? "en" : "zh",
  );
  const languageRef = useRef(language);
  languageRef.current = language;
  const t = (text: string) => translate(language, text);
  useEffect(() => {
    save(localStorage, "rain-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title =
      translate(language, "雨停之前") + " · " + translate(language, "纸上祈愿");
  }, [language]);
  const canvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<PaperScene | null>(null),
    game = useRef<Game>(newGame(1)),
    input = useRef<Input>(idleInput()),
    others = useRef<Inputs>({}),
    connection = useRef<Connection | null>(null),
    currentRoom = useRef<PublicRoom | null>(null),
    currentSession = useRef<Session | null>(null),
    phaseRef = useRef("menu"),
    authTime = useRef(0);
  const [phase, setPhase] = useState("menu"),
    [mode, setMode] = useState<Mode>(1),
    [level, setLevel] = useState(0),
    [name, setName] = useState(stored<string>(localStorage, "rain-name") ?? ""),
    [code, setCode] = useState(initialCode),
    [room, setRoom] = useState<PublicRoom | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hud, setHud] = useState<Game>(newGame(1)),
    [help, setHelp] = useState(false);
  const audio = useGameAudio(phase === "game");
  function sound(freq: number) {
    audio.effect(freq);
  }
  function changePhase(p: string) {
    phaseRef.current = p;
    setPhase(p);
    input.current = idleInput();
  }
  function receive(r: PublicRoom, ins: Inputs) {
    const previous = game.current;
    currentRoom.current = r;
    others.current = ins;
    if (r.game) {
      if (
        r.game.keys.length > previous.keys.length ||
        r.game.stars.length > previous.stars.length
      )
        sound(660);
      game.current = structuredClone(r.game);
      authTime.current = performance.now();
    }
    setRoom(r);
    if (r.phase !== phaseRef.current) changePhase(r.phase);
  }
  function enter(s: Session) {
    connection.current?.close();
    currentSession.current = s;
    setSession(s);
    save(sessionStorage, KEY, s);
    changePhase("lobby");
    connection.current = new Connection(s, receive, setConnected, setError);
  }
  useEffect(() => {
    const s = stored<Session>(sessionStorage, KEY);
    if (s && s.code && s.token && (!initialCode || initialCode === s.code)) {
      void api(`/rooms/${s.code}`, undefined, s.token)
        .then(() => enter(s))
        .catch(() => sessionStorage.removeItem(KEY));
    }
    return () => connection.current?.close();
  }, []);
  useEffect(() => {
    const s = new PaperScene(canvas.current!);
    scene.current = s;
    let last = performance.now(),
      acc = 0,
      net = 0,
      ui = 0,
      frame = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      const playing = phaseRef.current === "game";
      if (playing) {
        if (!currentSession.current) {
          while (acc >= 1 / 60) {
            const before = game.current.keys.length + game.current.stars.length;
            stepGame(game.current, { 0: input.current });
            if (game.current.keys.length + game.current.stars.length > before)
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
      s.render(
        display,
        currentSession.current?.slot ?? 0,
        dt,
        phaseRef.current !== "game",
        languageRef.current,
      );
      if (now - ui > 100) {
        setHud(structuredClone(game.current));
        ui = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      s.dispose();
    };
  }, []);
  useEffect(() => {
    const held = new Set<string>();
    const pressedAt = new Map<string, number>();
    const releases = new Map<string, ReturnType<typeof setTimeout>>();
    const refresh = () => {
      input.current = {
        axis:
          (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) -
          (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0),
        jump: held.has("Space") || held.has("ArrowUp") || held.has("KeyW"),
        fold: held.has("ShiftLeft") || held.has("ShiftRight"),
        turn: held.has("KeyQ") || held.has("KeyE"),
        reset: held.has("KeyR"),
        shelter: held.has("KeyS") || held.has("ArrowDown"),
        repair: held.has("KeyF"),
      };
      if (phaseRef.current === "game" && currentSession.current)
        connection.current?.input(game.current.id, input.current);
    };
    const keys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "KeyA",
      "KeyD",
      "KeyW",
      "Space",
      "ShiftLeft",
      "ShiftRight",
      "KeyQ",
      "KeyE",
      "KeyR",
      "KeyS",
      "KeyF",
      "ArrowDown",
    ];
    const down = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.matches("input,select,textarea") ||
        phaseRef.current !== "game"
      )
        return;
      if (e.code === "Escape") {
        setHelp((v) => !v);
        held.clear();
        refresh();
        return;
      }
      if (keys.includes(e.code)) {
        e.preventDefault();
        if (e.repeat) return;
        if (releases.has(e.code)) clearTimeout(releases.get(e.code));
        pressedAt.set(e.code, performance.now());
        if (!held.has(e.code) && e.code === "Space") sound(280);
        held.add(e.code);
        refresh();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!held.has(e.code)) return;
      const minimum = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(
        e.code,
      )
        ? 40
        : 120;
      const delay = Math.max(
        0,
        minimum - (performance.now() - (pressedAt.get(e.code) ?? 0)),
      );
      const release = () => {
        held.delete(e.code);
        releases.delete(e.code);
        refresh();
      };
      if (delay) releases.set(e.code, setTimeout(release, delay));
      else release();
    };
    const clear = () => {
      releases.forEach(clearTimeout);
      releases.clear();
      pressedAt.clear();
      held.clear();
      refresh();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);
  async function create() {
    void audio.start();
    setError("");
    save(localStorage, "rain-name", name);
    if (mode === 1) {
      connection.current?.close();
      currentSession.current = null;
      currentRoom.current = null;
      setSession(null);
      setRoom(null);
      game.current = newGame(1, level, crypto.randomUUID());
      changePhase("game");
      return;
    }
    setBusy(true);
    try {
      const r = await api("/rooms", { capacity: mode, level, name });
      enter({ code: r.room.code, token: r.token!, slot: r.slot! });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    void audio.start();
    setBusy(true);
    setError("");
    save(localStorage, "rain-name", name);
    try {
      const c = code.toUpperCase().trim();
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(c)) throw new Error("请输入 8 位房间码");
      const r = await api(`/rooms/${c}/join`, { name });
      enter({ code: c, token: r.token!, slot: r.slot! });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function leave() {
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
    sessionStorage.removeItem(KEY);
    setSession(null);
    setRoom(null);
    setError("");
    setHelp(false);
    game.current = newGame(1, level);
    changePhase("menu");
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  function restart(next = false) {
    setHelp(false);
    if (session)
      connection.current?.command({
        type: "restart",
        gameId: game.current.id,
        next,
      });
    else {
      const l = next
        ? (game.current.level + 1) % LEVELS.length
        : game.current.level;
      setLevel(l);
      game.current = newGame(1, l, crypto.randomUUID());
      input.current = idleInput();
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
  const touch = (
    field: "axis" | "jump" | "fold" | "turn" | "shelter" | "repair",
    value: number | boolean,
    label: string,
  ) => (
    <button
      className={`touch-key ${field === "jump" ? "jump" : ""}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        (input.current[field] as number | boolean) = value;
      }}
      onPointerUp={() => {
        (input.current[field] as number | boolean) =
          field === "axis" ? 0 : false;
      }}
      onPointerCancel={() => {
        (input.current[field] as number | boolean) =
          field === "axis" ? 0 : false;
      }}
    >
      {label}
    </button>
  );
  return (
    <main
      className={isPlaying ? "app playing" : "app"}
      lang={language === "zh" ? "zh-CN" : "en"}
    >
      <canvas ref={canvas} tabIndex={0} aria-label={t("千纸鹤横版游戏场景")} />
      <div className="atmosphere" />
      <div className="grain" />
      <header className="brand">
        <span className="brand-icon">{t("祈愿")}</span>
        <div>
          {t("雨停之前")}
          <small>{t("纸上祈愿")}</small>
        </div>
        <span className="edition">{t("纸鹤 · 许愿架 · 雨中归途")}</span>
      </header>
      <nav className="tools">
        <button
          className="language"
          aria-label={t("切换语言")}
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
        >
          中文 / EN
        </button>
        <MusicControls audio={audio} language={language} />
        <button onClick={() => setHelp((v) => !v)}>{t("操作说明")}</button>
        {isPlaying && <button onClick={leave}>{t("返回大厅")}</button>}
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
            <div className="intro-controls">
              <kbd>{t("空格")}</kbd> {t("起飞")} <kbd>Q</kbd> {t("转面")}{" "}
              <kbd>S</kbd> {t("展纸挡雨")}
            </div>
          </div>
          <section className="panel menu">
            <div className="panel-top">
              <span>{t("启程挂签")}</span>
              <b>{t("四个关卡")}</b>
            </div>
            <label>
              {t("你的名字")}
              <input
                value={name}
                maxLength={16}
                placeholder={t("旅人")}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
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
                    0{i + 1} · {t(l.name)}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy} onClick={create}>
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
              <b>0{hud.level + 1}</b>
              <div>
                {t(l.name)}
                <small>{t(l.sub)}</small>
              </div>
            </div>
            <div className="stats">
              <span>
                ⚿ {hud.keys.length}/{l.keys.length}
              </span>
              <span>✦ {hud.stars.length}/3</span>
              {l.gate && (
                <span className="gate-progress">
                  {hud.gateOpen
                    ? t("机关已开")
                    : `${t("机关")} ${Math.round(((hud.gateCharge ?? 0) / 4) * 100)}%`}
                </span>
              )}
              <span>
                ◷ {Math.floor(hud.time / 60)}:
                {String(Math.floor(hud.time % 60)).padStart(2, "0")}
              </span>
              {session && (
                <span className={connected ? "online" : "offline"}>
                  {t(connected ? "● 联机" : "● 重连中")}
                </span>
              )}
            </div>
          </section>
          <section
            className={`rain-hud ${(local.wetness ?? 0) > 70 ? "soaked" : ""}`}
            aria-label={t("纸鹤状态")}
          >
            <div className="meter-heading">
              <span>{t("纸的湿度")}</span>
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
                local.rainCover === "roof"
                  ? "檐下 · 正在晾干"
                  : local.rainCover === "ally"
                    ? "同伴庇护 · 正在晾干"
                    : local.sheltering
                      ? "展成方纸 · 自己仍会缓慢淋湿"
                      : local.rainCover === "rain"
                        ? "正在淋雨 · S 展纸 / 寻找屋檐"
                        : "避雨处 · 纸翼轻盈",
              )}
            </p>
            <div
              className={`fold-condition ${(local.foldsLeft ?? MAX_FOLDS) <= 2 ? "fragile" : ""}`}
            >
              <div className="meter-heading">
                <span>{t("剩余耐折")}</span>
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
                <div className="repair-track">
                  <i
                    style={{
                      width: `${((local.repairProgress ?? 0) / REPAIR_SECONDS) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="repair-away">{t("许愿架可修补 · R 返回存档处")}</p>
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
                    {p.sheltering ? t(" · 挡雨") : ""}
                  </span>
                ))}
              </div>
            )}
          </section>
          <aside className="compass">
            <div>
              <b>{t(hud.view === 0 ? "正面 · 左右" : "侧面 · 前后")}</b>
              <kbd>Q</kbd>
            </div>
            <svg viewBox="-4 -12 39 17" aria-label={t("俯视路线图")}>
              {l.platforms
                .filter((p) => p.kind !== "wall")
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
          </div>
          <div className="touch-controls">
            <div>
              {touch("axis", -1, "←")}
              {touch("axis", 1, "→")}
            </div>
            <div>
              {touch("turn", true, t("Q 转面"))}
              {touch("fold", true, t("纸桥"))}
              {touch("shelter", true, t("挡雨"))}
              {touch("repair", true, t("修补"))}
              {touch("jump", true, t("跳 / 滑翔"))}
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
              {t(l.name)} · {Math.floor(hud.time)} {t("秒")} · {hud.flips}{" "}
              {t("次转面")}
            </p>
            <div className="score">
              {"✦".repeat(hud.stars.length)}
              <span>{"✧".repeat(3 - hud.stars.length)}</span>
            </div>
            <p className="fine">
              {hud.players.reduce((sum, p) => sum + p.deaths, 0)}{" "}
              {t("次重新起飞")} · {hud.mode} {t("只纸鹤平安抵达")}
            </p>
            <button className="primary" onClick={() => restart(true)}>
              {t(hud.level === 3 ? "再来一趟" : "下一阵风 · 下一关")}
              <span>→</span>
            </button>
            {session && (
              <p className="fine">
                {t("全员同意后出发")} · {room?.votes.length ?? 0}/{hud.mode}
              </p>
            )}
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
            <span className="eyebrow">{t("纸会记住每一次折叠")}</span>
            <h2>{t("借出一张纸，留住一个愿望。")}</h2>
            <dl>
              <dt>← → / A D</dt>
              <dd>{t("沿当前画面的左右方向行走")}</dd>
              <dt>{t("空格")} / ↑ / W</dt>
              <dd>{t("跳跃；下落时按住可以滑翔。扇翅不消耗耐折。")}</dd>
              <dt>Q / E</dt>
              <dd>
                {t("世界旋转 90°，左右键控制另一条轴；联机时全队共享视角。")}
              </dd>
              <dt>S / ↓</dt>
              <dd>
                {t(
                  "地面按住：整只纸鹤摊成方纸，原地遮住附近同伴。松开折回纸鹤；两张纸能互相挡雨。",
                )}
              </dd>
              <dt>Shift</dt>
              <dd>{t("按住折成低矮纸桥，供同伴跨过；松开还原。")}</dd>
              <dt>F</dt>
              <dd>
                {t("在起点或存档许愿架旁站稳，按住 2 秒修补；移动会中断。")}
              </dd>
              <dt>R</dt>
              <dd>{t("返回最近存档许愿架。湿度清零，耐折不会重置。")}</dd>
            </dl>
            <p>
              {t(
                "每张纸有 6 格耐折，每次变成方纸或纸桥消耗 1 格，湿度达到 60% 时消耗 2 格。保持形态不额外消耗；用完后仍可走、跳、滑翔。首次点亮新许愿架会修复纸张，也可在架旁按 F 修补。",
              )}
            </p>
            <p>
              {t(
                "淋湿到 100% 会回存档，檐下可以晾干。找齐钥匙后，全员到灯门过关。机关需要连续踩住 4 秒：单人一块，多人两块。星星是额外挑战。",
              )}
            </p>
            {isPlaying && (
              <button className="primary" onClick={() => restart(false)}>
                {t(session ? "发起重开投票" : "重新开始本关")}
              </button>
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
