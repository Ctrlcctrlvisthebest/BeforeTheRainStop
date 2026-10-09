import { useEffect, useRef, useState, type RefObject } from "react";
import { idleInput, stepGame, type Game, type Input } from "./game";
import type { KeyboardInput } from "./keyboard-input";
import { mergeInput, type TouchInput } from "./touch-input";
import { guideFor, newGuideTracker } from "./guide";
import { loadScene } from "./scene-loader";
import type { PaperScene } from "./scene";
import { FrameBudget } from "./frame-budget";
import { MINITOOL } from "./build-target";
import type { Language } from "./i18n";
import type { QualityMode } from "./render-quality";
import type { RoomSession } from "./room-session";

export type AppPhase = "menu" | "lobby" | "game";
type SceneStatus =
  "idle" | "loading" | "ready" | "error" | "context-lost" | "context-failed";
interface RuntimeOptions {
  phase: AppPhase;
  phaseRef: RefObject<AppPhase>;
  canvas: RefObject<HTMLCanvasElement | null>;
  game: RefObject<Game>;
  controls: {
    value: RefObject<Input>;
    keyboard: RefObject<KeyboardInput>;
    touch: RefObject<TouchInput>;
  };
  room: RoomSession;
  presentation: {
    paused: boolean;
    language: Language;
    compact: boolean;
    guideEnabled: boolean;
    quality: QualityMode;
  };
  onStep: (game: Game, input: Input) => void;
  onPickup: () => void;
  onFrame: (game: Game) => void;
  onHud: (game: Game) => void;
}

/** Owns preparation, simulation/prediction and rendering; reports domain events
 * to the page without managing score storage, audio or room connections. */
export function useGameRuntime(options: RuntimeOptions) {
  const latest = useRef(options);
  latest.current = options;
  const activeScene = useRef<PaperScene | null>(null);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>("idle");
  const sceneReady = useRef(false);
  const [tracker] = useState(newGuideTracker);
  const [initialGuide] = useState(() =>
    guideFor(options.game.current, 0, tracker),
  );
  const guide = useRef(initialGuide);
  const game = options.game,
    canvas = options.canvas,
    phaseRef = options.phaseRef;
  const input = options.controls.value,
    keyboardInput = options.controls.keyboard,
    touchInput = options.controls.touch;
  const currentSession = options.room.currentSession,
    currentRoom = options.room.currentRoom,
    others = options.room.inputs,
    authTime = options.room.snapshotTime;
  const phase = options.phase;
  useEffect(() => {
    activeScene.current?.setQuality(options.presentation.quality);
  }, [options.presentation.quality]);
  useEffect(() => {
    if (phase !== "game") return;
    let cancelled = false,
      frame = 0,
      scene: PaperScene | null = null;
    let visibility: (() => void) | undefined;
    sceneReady.current = false;
    setSceneStatus("loading");
    void loadScene()
      .then(async ({ PaperScene }) => {
        if (cancelled) return;
        let contextPaused = false,
          preparing = false,
          preparationVersion = 0,
          failed = false,
          preparedLevel = -1,
          preparedMode = -1,
          last = performance.now(),
          acc = 0,
          net = 0,
          ui = 0,
          simulatedGameId = game.current.id;
        const clearSceneInput = () => {
          keyboardInput.current.clear();
          touchInput.current.clear();
          input.current = idleInput();
          latest.current.room.sendInput(game.current.id, input.current);
        };
        const failScene = (error: unknown) => {
          if (cancelled) return;
          console.error("[BeforeTheRainStop] Scene preparation failed", error);
          failed = true;
          cancelAnimationFrame(frame);
          sceneReady.current = false;
          clearSceneInput();
          setSceneStatus("error");
        };
        const created = new PaperScene(canvas.current!, {
          quality: latest.current.presentation.quality,
          onContextStatus: (status) => {
            if (cancelled) return;
            contextPaused = status !== "restored";
            preparationVersion++;
            preparing = false;
            preparedLevel = -1;
            preparedMode = -1;
            last = performance.now();
            acc = 0;
            clearSceneInput();
            sceneReady.current = false;
            setSceneStatus(
              status === "restored"
                ? "loading"
                : status === "failed"
                  ? "context-failed"
                  : "context-lost",
            );
            if (contextPaused) latest.current.room.suspend();
            else latest.current.room.resume();
            if (status === "restored")
              void prepareCurrentScene().catch(failScene);
          },
        });
        scene = created;
        activeScene.current = created;
        const prepareCurrentScene = async () => {
          const revision = ++preparationVersion;
          preparing = true;
          sceneReady.current = false;
          setSceneStatus("loading");
          clearSceneInput();
          const current = game.current;
          guide.current = guideFor(
            current,
            currentSession.current?.slot ?? 0,
            tracker,
          );
          try {
            const ready = await created.prepare(
              current,
              currentSession.current?.slot ?? 0,
              false,
              latest.current.presentation.language,
              latest.current.presentation.guideEnabled
                ? guide.current.target
                : undefined,
              latest.current.presentation.compact,
            );
            if (
              cancelled ||
              revision !== preparationVersion ||
              !ready ||
              contextPaused
            )
              return;
            preparedLevel = current.level;
            preparedMode = current.mode;
            sceneReady.current =
              preparedLevel === game.current.level &&
              preparedMode === game.current.mode;
            setSceneStatus(sceneReady.current ? "ready" : "loading");
          } catch (error) {
            if (!cancelled && revision === preparationVersion) throw error;
          } finally {
            if (revision === preparationVersion) {
              preparing = false;
              last = performance.now();
              acc = 0;
              ui = 0;
            }
          }
        };
        await prepareCurrentScene();
        if (cancelled) return;
        const budget = new FrameBudget();
        const update = (now: number) => {
          if (simulatedGameId !== game.current.id) {
            simulatedGameId = game.current.id;
            last = now;
            acc = 0;
            ui = 0;
          }
          if (document.hidden || contextPaused || preparing) {
            created.observeFrame(now, false);
            last = now;
            acc = 0;
            return;
          }
          if (
            preparedLevel !== game.current.level ||
            preparedMode !== game.current.mode
          ) {
            void prepareCurrentScene().catch(failScene);
            return;
          }
          if (
            !budget.ready(
              now,
              MINITOOL ||
                (latest.current.presentation.paused && !currentSession.current)
                ? 30
                : 60,
            )
          )
            return;
          created.observeFrame(
            now,
            !MINITOOL &&
              !latest.current.presentation.paused &&
              game.current.status === "playing",
          );
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          acc += dt;
          const playing = phaseRef.current === "game";
          input.current = latest.current.presentation.paused
            ? idleInput()
            : mergeInput(
                keyboardInput.current.read(now),
                touchInput.current.read(now),
              );
          if (playing) {
            if (!currentSession.current && latest.current.presentation.paused) {
              acc = 0;
            } else if (!currentSession.current) {
              while (acc >= 1 / 60) {
                const before =
                  game.current.keys.length + game.current.stars.length;
                if (!MINITOOL)
                  latest.current.onStep(game.current, input.current);
                stepGame(game.current, { 0: input.current });
                if (
                  game.current.keys.length + game.current.stars.length >
                  before
                )
                  latest.current.onPickup();
                acc -= 1 / 60;
              }
            } else {
              acc = 0;
              if (now - net > 33) {
                latest.current.room.sendInput(game.current.id, input.current);
                net = now;
              }
            }
          } else acc = 0;
          latest.current.onFrame(game.current);
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
            tracker,
          );
          created.render(
            display,
            currentSession.current?.slot ?? 0,
            dt,
            phaseRef.current !== "game",
            latest.current.presentation.language,
            latest.current.presentation.guideEnabled && playing
              ? guide.current.target
              : undefined,
            latest.current.presentation.compact,
          );
          if (now - ui > 100) {
            latest.current.onHud(structuredClone(game.current));
            ui = now;
          }
        };
        const loop = (now: number) => {
          if (cancelled || failed || (MINITOOL && document.hidden)) return;
          try {
            update(now);
          } catch (error) {
            console.error("[BeforeTheRainStop] Game update failed", error);
            sceneReady.current = false;
            clearSceneInput();
            setSceneStatus("error");
            return;
          }
          frame = requestAnimationFrame(loop);
        };
        if (MINITOOL) {
          visibility = () => {
            cancelAnimationFrame(frame);
            last = performance.now();
            acc = 0;
            keyboardInput.current.clear();
            touchInput.current.clear();
            input.current = idleInput();
            if (!document.hidden && !cancelled)
              frame = requestAnimationFrame(loop);
          };
          document.addEventListener("visibilitychange", visibility);
          visibility();
        } else frame = requestAnimationFrame(loop);
      })
      .catch((error) => {
        console.error("[BeforeTheRainStop] Scene startup failed", error);
        if (!cancelled) setSceneStatus("error");
      });
    return () => {
      cancelled = true;
      sceneReady.current = false;
      cancelAnimationFrame(frame);
      if (visibility)
        document.removeEventListener("visibilitychange", visibility);
      activeScene.current = null;
      scene?.dispose();
    };
  }, [options.phase]);
  return { sceneStatus, sceneReady, guide };
}
