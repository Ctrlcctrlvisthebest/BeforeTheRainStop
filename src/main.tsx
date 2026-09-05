import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LEVELS,
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
const KEY = "rain-action-session-v2";
const initialCode = new URLSearchParams(location.search).get("room") ?? "";
function App() {
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
    [help, setHelp] = useState(false),
    [muted, setMuted] = useState(true);
  const audio = useRef<AudioContext | null>(null),
    mutedRef = useRef(true);
  function sound(freq: number) {
    if (mutedRef.current) return;
    try {
      const c = audio.current ?? (audio.current = new AudioContext());
      void c.resume();
      const o = c.createOscillator(),
        v = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        freq * 1.5,
        c.currentTime + 0.12,
      );
      v.gain.setValueAtTime(0.045, c.currentTime);
      v.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
      o.connect(v);
      v.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.2);
    } catch {}
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
      s.render(display, currentSession.current?.slot ?? 0, dt);
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
      setError(`分享房间码：${session?.code}`);
    }
  }
  const l = LEVELS[hud.level],
    local = hud.players[session?.slot ?? 0] ?? hud.players[0],
    isPlaying = phase === "game",
    won = isPlaying && hud.status === "won";
  const touch = (
    field: "axis" | "jump" | "fold" | "turn",
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
    <main className={isPlaying ? "app playing" : "app"}>
      <canvas ref={canvas} tabIndex={0} aria-label="千纸鹤横版游戏场景" />
      <div className="grain" />
      <header className="brand">
        <span className="brand-icon">◇</span>
        <div>
          雨停之前<small>BEFORE THE RAIN STOPS</small>
        </div>
        <span className="edition">另一面 · ACTION EDITION</span>
      </header>
      <nav className="tools">
        <button
          aria-label={muted ? "开启音效" : "关闭音效"}
          onClick={() => {
            mutedRef.current = !muted;
            setMuted(!muted);
            if (muted) sound(440);
          }}
        >
          {muted ? "♪ 关" : "♪ 开"}
        </button>
        <button onClick={() => setHelp((v) => !v)}>操作说明</button>
        {isPlaying && <button onClick={leave}>返回大厅</button>}
      </nav>
      {error && (
        <div role="alert" className="toast" onClick={() => setError("")}>
          {error}
          <span>×</span>
        </div>
      )}
      {phase === "menu" && (
        <>
          <div className="intro">
            <span className="eyebrow">1 / 2 / 3 / 6 人 · 纸上合作冒险</span>
            <h1>
              换个角度，
              <br />
              一起到家。
            </h1>
            <p>
              向前跑，跳过断口。
              <br />
              路被挡住时，转动世界。
            </p>
            <div className="intro-controls">
              <kbd>← →</kbd> 跑 <kbd>空格</kbd> 跳 <kbd>Q</kbd> 换一面
            </div>
          </div>
          <section className="panel menu">
            <div className="panel-top">
              <span>开始一场纸上旅行</span>
              <b>01 — 04</b>
            </div>
            <label>
              你的名字
              <input
                value={name}
                maxLength={16}
                placeholder="旅人"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>同行人数</label>
            <div className="modes">
              {MODES.map((m) => (
                <button
                  key={m}
                  className={mode === m ? "selected" : ""}
                  onClick={() => setMode(m)}
                >
                  <strong>{m}</strong>
                  <span>{m === 1 ? "独自探索" : "好友联机"}</span>
                </button>
              ))}
            </div>
            <label>
              出发关卡
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
                    0{i + 1} · {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy} onClick={create}>
              {busy ? "正在连接…" : mode === 1 ? "开始冒险" : "创建好友房间"}
              <span>↗</span>
            </button>
            <div className="separator">已有同伴在等你</div>
            <div className="join">
              <input
                aria-label="房间码"
                maxLength={8}
                placeholder="输入 8 位房间码"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button disabled={busy} onClick={join}>
                加入 →
              </button>
            </div>
            <p className="fine">每人一只纸鹤 · 用房间码邀请好友 · 不需要注册</p>
          </section>
          <footer>
            一张纸的路，不止一个方向。<span>横版动作 × 90° 视角切换</span>
          </footer>
        </>
      )}
      {phase === "lobby" && room && (
        <section className="panel lobby">
          <span className="eyebrow">等一阵一起出发的风</span>
          <h2>{LEVELS[room.level].name}</h2>
          <div className="room-code">
            <div>
              <small>房间码</small>
              <strong>{room.code}</strong>
            </div>
            <button onClick={copyInvite}>复制邀请 ↗</button>
          </div>
          <div className="seats">
            {Array.from({ length: room.capacity }, (_, i) => {
              const p = room.players.find((x) => x.slot === i);
              return (
                <div key={i} className="seat">
                  <span style={{ color: COLORS[i] }}>◇</span>
                  <div>
                    {p?.name ?? "等待同伴"}
                    <small>
                      {p
                        ? p.online
                          ? "已连接"
                          : "连接中…"
                        : "分享房间码邀请加入"}
                    </small>
                  </div>
                  {p?.slot === session?.slot && <b>你</b>}
                  {p?.slot === room.host && <em>房主</em>}
                </div>
              );
            })}
          </div>
          <p className="fine">
            每个人独立移动和跳跃。按 Q 会为全队转动视角；先和同伴打声招呼。
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
              ? `一起出发（${room.players.filter((p) => p.online).length}/${room.capacity}）`
              : "等待房主开始"}
            <span>→</span>
          </button>
          <button className="text-button" onClick={leave}>
            离开房间
          </button>
        </section>
      )}
      {isPlaying && (
        <>
          <section className="hud">
            <div className="stage">
              <b>0{hud.level + 1}</b>
              <div>
                {l.name}
                <small>{l.sub}</small>
              </div>
            </div>
            <div className="stats">
              <span>
                ⚿ {hud.keys.length}/{l.keys.length}
              </span>
              <span>✦ {hud.stars.length}/3</span>
              <span>
                ◷ {Math.floor(hud.time / 60)}:
                {String(Math.floor(hud.time % 60)).padStart(2, "0")}
              </span>
              {session && (
                <span className={connected ? "online" : "offline"}>
                  {connected ? "● 联机" : "● 重连中"}
                </span>
              )}
            </div>
          </section>
          <aside className="compass">
            <div>
              <b>{hud.view === 0 ? "正面 · 左右" : "侧面 · 前后"}</b>
              <kbd>Q</kbd>
            </div>
            <svg viewBox="-4 -12 39 17" aria-label="俯视路线图">
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
                    fill="#d8dbcd"
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
              你是 <i style={{ background: COLORS[local.id] }} />
              {NAMES[local.id]} ·{" "}
              {local.checkpoint >= 0 ? "已记录存档旗" : "起点"}
            </small>
          </aside>
          <div className="bottom-hint">
            <kbd>← →</kbd> 移动 <kbd>空格</kbd> 跳 / 按住滑翔 <kbd>Q</kbd> 转动{" "}
            <kbd>Shift</kbd> 折成桥 <kbd>R</kbd> 回存档旗
          </div>
          <div className="touch-controls">
            <div>
              {touch("axis", -1, "←")}
              {touch("axis", 1, "→")}
            </div>
            <div>
              {touch("turn", true, "Q 转面")}
              {touch("fold", true, "折桥")}
              {touch("jump", true, "跳 / 滑翔")}
            </div>
          </div>
          {local.arrived && !won && (
            <div className="waiting">
              你已抵达，等同伴一起到家 ·{" "}
              {hud.players.filter((p) => p.arrived).length}/{hud.mode}
            </div>
          )}
          {session && room?.players.some((p) => !p.online) && (
            <div className="waiting">等待同伴重连，关卡已暂停</div>
          )}
          {room && room.votes.length > 0 && (
            <div className="vote">
              {room.voteNext ? "下一关" : "重新开始"} · {room.votes.length}/
              {room.capacity} 人同意{" "}
              <button
                onClick={() => restart(room.voteNext ?? false)}
                disabled={room.votes.includes(session?.slot ?? -1)}
              >
                我也同意
              </button>
            </div>
          )}
        </>
      )}
      {won && (
        <div className="scrim">
          <section className="panel win">
            <span className="eyebrow">每一只纸鹤，都到家了</span>
            <div className="big-star">✦</div>
            <h2>这一面，也一起走过。</h2>
            <p>
              {l.name} · {Math.floor(hud.time)} 秒 · {hud.flips} 次转面
            </p>
            <div className="score">
              {"✦".repeat(hud.stars.length)}
              <span>{"✧".repeat(3 - hud.stars.length)}</span>
            </div>
            <p className="fine">
              {hud.players.reduce((sum, p) => sum + p.deaths, 0)} 次重新起飞 ·{" "}
              {hud.mode} 只纸鹤平安抵达
            </p>
            <button className="primary" onClick={() => restart(true)}>
              {hud.level === 3 ? "再来一趟" : "下一阵风 · 下一关"}
              <span>→</span>
            </button>
            {session && (
              <p className="fine">
                全员同意后出发 · {room?.votes.length ?? 0}/{hud.mode}
              </p>
            )}
            <button className="text-button" onClick={leave}>
              返回大厅
            </button>
          </section>
        </div>
      )}
      {help && (
        <div className="scrim">
          <section className="panel help">
            <button className="close" onClick={() => setHelp(false)}>
              ×
            </button>
            <span className="eyebrow">让纸鹤飞起来</span>
            <h2>先跳起来，再换个角度。</h2>
            <dl>
              <dt>← → / A D</dt>
              <dd>沿当前画面的左右方向行走</dd>
              <dt>空格 / ↑ / W</dt>
              <dd>跳跃；在下落时按住，展开翅膀滑翔</dd>
              <dt>Q / E</dt>
              <dd>世界旋转 90°，左右键转而控制另一条轴。联机时全队共享视角</dd>
              <dt>Shift</dt>
              <dd>落地后按住折成桥，让同伴从翅膀上走过；也能跳到同伴头上</dd>
              <dt>R</dt>
              <dd>回到你最近点亮的存档旗</dd>
            </dl>
            <p>
              找齐钥匙，所有纸鹤抵达金色灯门才过关。多人机关需要同时站上两块圆垫；单人只需一块。星星是额外挑战。
            </p>
            {isPlaying && (
              <button className="primary" onClick={() => restart(false)}>
                {session ? "发起重开投票" : "重新开始本关"}
              </button>
            )}
            <button className="text-button" onClick={() => setHelp(false)}>
              知道了，继续冒险
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
