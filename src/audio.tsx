import { useEffect, useRef, useState } from "react";
import { save, stored } from "./storage";
import { translate, type Language } from "./i18n";

type Playback = "ready" | "loading" | "playing" | "paused" | "error";
export function useGameAudio(inGame: boolean) {
  const player = useRef<HTMLAudioElement>(null);
  const [initialEnabled] = useState(
    () => stored<boolean>("local", "rain-music-enabled") !== false,
  );
  const enabled = useRef(initialEnabled);
  const [state, setState] = useState<Playback>("ready");
  const [volume, setVolumeState] = useState(() => {
    const saved = stored<number>("local", "rain-music-volume");
    return typeof saved === "number" && Number.isFinite(saved)
      ? Math.max(0, Math.min(100, saved))
      : 60;
  });
  const volumeRef = useRef(volume);
  const fx = useRef<AudioContext | null>(null);
  const fading = useRef(0);
  const activeRequest = useRef(0);
  const continueAfterHide = useRef(false);
  volumeRef.current = volume;

  function setEnabled(value: boolean) {
    enabled.current = value;
    save("local", "rain-music-enabled", value);
  }
  function unlockEffects() {
    try {
      const context = fx.current ?? (fx.current = new AudioContext());
      void context.resume().catch(() => {});
    } catch {
      /* Background music still works if Web Audio is unavailable. */
    }
  }
  async function start() {
    const audio = player.current;
    if (!audio || !enabled.current || document.hidden) return;
    unlockEffects();
    if (!audio.paused) return;
    const request = ++activeRequest.current;
    setState("loading");
    try {
      // Call play inside the user gesture, before awaiting loading or network work.
      if (audio.error) audio.load();
      await audio.play();
      if (request !== activeRequest.current || !enabled.current) return;
      if (document.hidden) {
        continueAfterHide.current = true;
        audio.pause();
        return;
      }
      setState("playing");
    } catch (error) {
      if (request !== activeRequest.current) return;
      setState(
        (error as DOMException).name === "NotAllowedError" ? "ready" : "error",
      );
    }
  }
  function toggle() {
    if (state === "playing" || state === "loading") {
      setEnabled(false);
      continueAfterHide.current = false;
      ++activeRequest.current;
      player.current?.pause();
      setState("paused");
    } else {
      setEnabled(true);
      void start();
    }
  }
  function setVolume(value: number) {
    const next = Math.max(0, Math.min(100, value));
    setVolumeState(next);
    save("local", "rain-music-volume", next);
  }
  function effect(freq: number) {
    const context = fx.current;
    if (
      !context ||
      context.state !== "running" ||
      !enabled.current ||
      document.hidden ||
      !volumeRef.current
    )
      return;
    const tone = context.createOscillator(),
      gain = context.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(freq, context.currentTime);
    tone.frequency.exponentialRampToValueAtTime(
      freq * 1.5,
      context.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(
      (0.055 * volumeRef.current) / 100,
      context.currentTime,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    tone.connect(gain);
    gain.connect(context.destination);
    tone.onended = () => {
      tone.disconnect();
      gain.disconnect();
    };
    tone.start();
    tone.stop(context.currentTime + 0.24);
  }
  useEffect(() => {
    const audio = player.current;
    if (!audio) return;
    const target = (volume / 100) * (inGame ? 0.68 : 0.9);
    const initial = audio.volume;
    const from = performance.now();
    const fade = () => {
      const progress = Math.min(1, (performance.now() - from) / 450);
      audio.volume = initial + (target - initial) * progress;
      if (progress < 1) fading.current = requestAnimationFrame(fade);
    };
    fading.current = requestAnimationFrame(fade);
    return () => cancelAnimationFrame(fading.current);
  }, [volume, inGame]);
  useEffect(() => {
    const audio = player.current;
    const visibility = () => {
      if (document.hidden) {
        continueAfterHide.current = enabled.current && !!audio && !audio.paused;
        if (continueAfterHide.current) {
          ++activeRequest.current;
          audio?.pause();
        }
        void fx.current?.suspend().catch(() => {});
      } else if (continueAfterHide.current && enabled.current) {
        continueAfterHide.current = false;
        void start();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      ++activeRequest.current;
      audio?.pause();
      cancelAnimationFrame(fading.current);
      void fx.current?.close().catch(() => {});
    };
  }, []);
  return { player, state, setState, volume, setVolume, start, toggle, effect };
}
export type GameAudio = ReturnType<typeof useGameAudio>;
export function MusicControls({
  audio,
  language,
}: {
  audio: GameAudio;
  language: Language;
}) {
  const t = (text: string) => translate(language, text);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(0);
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const playing = audio.state === "playing";
  return (
    <div className="music-control" ref={controls}>
      <audio
        ref={audio.player}
        src={`${import.meta.env.BASE_URL}audio/rain-wishes.m4a`}
        loop
        preload="none"
        aria-label={t("背景音乐：檐下的愿望")}
        onPlaying={() => audio.setState("playing")}
        onPause={() => audio.setState("paused")}
        onError={() => audio.setState("error")}
        onTimeUpdate={(event) => {
          if (open) setPosition(event.currentTarget.currentTime);
        }}
      />
      <button
        className={playing ? "music-active" : ""}
        aria-label={t(playing ? "暂停背景音乐" : "播放背景音乐")}
        aria-pressed={playing}
        onClick={audio.toggle}
      >
        {t(
          audio.state === "loading"
            ? "♪ 加载中…"
            : playing
              ? "♪ 音乐开"
              : audio.state === "error"
                ? "♪ 重试音乐"
                : "♪ 播放音乐",
        )}
      </button>
      <button
        className="music-options"
        aria-label={t("音乐设置")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⌄
      </button>
      {open && (
        <section className="music-panel" aria-label={t("音乐设置")}>
          <div className="music-heading">
            <span>♫</span>
            <div>
              <strong>{t("檐下的愿望")}</strong>
              <small>{t("原创器乐 · 循环播放")}</small>
            </div>
          </div>
          <p>{t("拨弦、笛音与远处的钟声")}</p>
          <div className="music-time">
            <span>
              {t(
                playing
                  ? "正在播放"
                  : audio.state === "error"
                    ? "加载失败，点击音乐按钮重试"
                    : "点击音乐按钮开始播放",
              )}
            </span>
            <output aria-label={t("音乐播放进度")}>
              {Math.floor(position / 60)}:
              {String(Math.floor(position % 60)).padStart(2, "0")} / 1:20
            </output>
          </div>
          <label>
            {t("音量")}
            <span>{audio.volume}%</span>
            <input
              aria-label={t("音乐音量")}
              type="range"
              min="0"
              max="100"
              step="1"
              value={audio.volume}
              onChange={(event) => audio.setVolume(Number(event.target.value))}
            />
          </label>
          <small className="music-note">
            {t("关卡中自动轻放，离开页面时暂停")}
          </small>
        </section>
      )}
    </div>
  );
}
