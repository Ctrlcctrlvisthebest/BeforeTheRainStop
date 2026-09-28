import { useEffect, useRef, useState } from "react";
import { save, stored } from "./storage";
import { translate, type Language } from "./i18n";
import type { GameCue } from "./game-audio-events";

type Playback = "ready" | "loading" | "playing" | "paused" | "error";
const MUSIC_TRACKS = [
  {
    id: "lantern-walk",
    title: "沿灯而行",
    choice: "轻快 · 沿灯而行",
    description: "轻拨弦、笛音短句与柔和鼓点",
    duration: 80,
  },
  {
    id: "rain-wishes",
    title: "檐下的愿望",
    choice: "原版 · 檐下的愿望",
    description: "拨弦、笛音与远处的钟声",
    duration: 80,
  },
] as const;
const musicSource = (id: string) =>
  `${import.meta.env.BASE_URL}audio/${id}.m4a`;
const musicTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function useGameAudio(inGame: boolean) {
  const player = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState(() => {
    const saved = stored<unknown>("local", "rain-music-track");
    return MUSIC_TRACKS.find((track) => track.id === saved) ?? MUSIC_TRACKS[0];
  });
  const trackRef = useRef(track);
  // Keep React's initial src stable. Subsequent selections set the media source
  // synchronously so play() stays inside the tap gesture on mobile browsers.
  const initialSource = useRef(musicSource(track.id));
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
  const [effectsEnabled, setEffectsEnabledState] = useState(() => {
    const saved = stored<unknown>("local", "rain-sfx-enabled");
    return typeof saved === "boolean" ? saved : initialEnabled;
  });
  const [effectsVolume, setEffectsVolumeState] = useState(() => {
    const saved = stored<number>("local", "rain-sfx-volume");
    return typeof saved === "number" && Number.isFinite(saved)
      ? Math.max(0, Math.min(100, saved))
      : volume;
  });
  const effectsEnabledRef = useRef(effectsEnabled);
  const effectsVolumeRef = useRef(effectsVolume);
  const fx = useRef<AudioContext | null>(null);
  const fading = useRef(0);
  const activeRequest = useRef(0);
  const continueAfterHide = useRef(false);
  effectsEnabledRef.current = effectsEnabled;
  effectsVolumeRef.current = effectsVolume;
  // Preserve the old combined mute/volume once, then keep both channels separate.
  useEffect(() => {
    save("local", "rain-sfx-enabled", effectsEnabled);
    save("local", "rain-sfx-volume", effectsVolume);
  }, [effectsEnabled, effectsVolume]);

  function setEnabled(value: boolean) {
    enabled.current = value;
    save("local", "rain-music-enabled", value);
  }
  function unlockEffects() {
    if (!effectsEnabledRef.current || document.hidden) return;
    try {
      const context = fx.current ?? (fx.current = new AudioContext());
      void context.resume().catch(() => {});
    } catch {
      /* Background music still works if Web Audio is unavailable. */
    }
  }
  async function start() {
    if (document.hidden) return;
    unlockEffects();
    const audio = player.current;
    if (!audio || !enabled.current) return;
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
  function selectTrack(id: string) {
    const next = MUSIC_TRACKS.find((track) => track.id === id);
    if (!next || next.id === trackRef.current.id) return;
    ++activeRequest.current;
    trackRef.current = next;
    setTrack(next);
    save("local", "rain-music-track", next.id);
    const audio = player.current;
    if (!audio) return;
    audio.pause();
    audio.src = musicSource(next.id);
    audio.load();
    setState(enabled.current ? "ready" : "paused");
    if (enabled.current) void start();
  }
  function setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(100, value));
    setVolumeState(next);
    save("local", "rain-music-volume", next);
  }
  function toggleEffects() {
    const next = !effectsEnabledRef.current;
    effectsEnabledRef.current = next;
    setEffectsEnabledState(next);
    save("local", "rain-sfx-enabled", next);
    if (next) unlockEffects();
  }
  function setEffectsVolume(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(100, value));
    effectsVolumeRef.current = next;
    setEffectsVolumeState(next);
    save("local", "rain-sfx-volume", next);
  }
  function toneAt(
    freq: number,
    offset = 0,
    duration = 0.22,
    level = 0.055,
    rise = 1.5,
  ) {
    const context = fx.current;
    if (
      !context ||
      context.state !== "running" ||
      !effectsEnabledRef.current ||
      document.hidden ||
      !effectsVolumeRef.current ||
      !Number.isFinite(freq) ||
      freq <= 0
    )
      return;
    const start = context.currentTime + offset;
    const tone = context.createOscillator(),
      gain = context.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(freq, start);
    tone.frequency.exponentialRampToValueAtTime(
      freq * rise,
      start + duration * 0.55,
    );
    // A short attack avoids a click; quiet, separated notes leave room for BGM.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      (level * effectsVolumeRef.current) / 100,
      start + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    tone.connect(gain);
    gain.connect(context.destination);
    tone.onended = () => {
      tone.disconnect();
      gain.disconnect();
    };
    tone.start(start);
    tone.stop(start + duration + 0.02);
  }
  function effect(freq: number) {
    toneAt(freq);
  }
  function cue(name: GameCue) {
    if (name === "bridge-ready") {
      toneAt(392, 0, 0.16, 0.038, 1);
      toneAt(523.25, 0.1, 0.23, 0.032, 1);
    } else if (name === "gate-open") {
      toneAt(293.66, 0, 0.2, 0.035, 1);
      toneAt(440, 0.12, 0.24, 0.032, 1);
    } else if (name === "exit-open") {
      toneAt(523.25, 0, 0.22, 0.033, 1);
      toneAt(659.25, 0.13, 0.28, 0.027, 1);
    }
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
      } else {
        unlockEffects();
        if (continueAfterHide.current && enabled.current) {
          continueAfterHide.current = false;
          void start();
        }
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
  return {
    player,
    initialSource: initialSource.current,
    track,
    selectTrack,
    state,
    setState,
    volume,
    setVolume,
    start,
    toggle,
    effect,
    cue,
    effectsEnabled,
    toggleEffects,
    effectsVolume,
    setEffectsVolume,
  };
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
  useEffect(() => setPosition(0), [audio.track.id]);
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
        src={audio.initialSource}
        loop
        preload="none"
        aria-label={`${t("背景音乐")}：${t(audio.track.title)}`}
        onPlaying={(event) => {
          if (!event.currentTarget.paused) audio.setState("playing");
        }}
        onPause={(event) => {
          if (event.currentTarget.paused) audio.setState("paused");
        }}
        onError={(event) => {
          if (event.currentTarget.error) audio.setState("error");
        }}
        onEmptied={() => setPosition(0)}
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
              <strong>{t(audio.track.title)}</strong>
              <small>{t("原创器乐 · 循环播放")}</small>
            </div>
          </div>
          <label className="music-track-picker">
            {t("曲目")}
            <select
              aria-label={t("背景音乐曲目")}
              value={audio.track.id}
              onChange={(event) => audio.selectTrack(event.target.value)}
            >
              {MUSIC_TRACKS.map((track) => (
                <option key={track.id} value={track.id}>
                  {t(track.choice)}
                </option>
              ))}
            </select>
          </label>
          <p>{t(audio.track.description)}</p>
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
              {musicTime(position)} / {musicTime(audio.track.duration)}
            </output>
          </div>
          <label>
            {language === "zh" ? "音乐音量" : "Music volume"}
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
          <button
            type="button"
            className="effects-toggle"
            aria-pressed={audio.effectsEnabled}
            onClick={audio.toggleEffects}
          >
            {language === "zh"
              ? audio.effectsEnabled
                ? "音效开"
                : "音效关"
              : audio.effectsEnabled
                ? "Sound effects on"
                : "Sound effects off"}
          </button>
          <label>
            {language === "zh" ? "音效音量" : "Effects volume"}
            <span>{audio.effectsVolume}%</span>
            <input
              aria-label={language === "zh" ? "音效音量" : "Effects volume"}
              type="range"
              min="0"
              max="100"
              step="1"
              value={audio.effectsVolume}
              onChange={(event) =>
                audio.setEffectsVolume(Number(event.target.value))
              }
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
