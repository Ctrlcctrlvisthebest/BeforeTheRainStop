import { PaperScene } from "../src/scene";
import { newGame, LEVELS } from "../src/game";
import { qualityMode } from "../src/render-quality";
import { RENDER_CASES, summarize } from "./render-stats";
const canvas = document.querySelector("canvas")!;
const button = document.querySelector("button")!;
const status = document.querySelector("#status")!;
const output = document.querySelector("#result")!;
const snapshot = document.querySelector<HTMLButtonElement>("#snapshot")!;
const stop = document.querySelector<HTMLButtonElement>("#stop")!;
const quality = document.querySelector(
  "#quality",
) as unknown as HTMLSelectElement;
const scope = document.querySelector("#scope") as unknown as HTMLSelectElement;
let cancelled = false;
stop.onclick = () => {
  cancelled = true;
};
const nextFrame = () =>
  new Promise<number>((resolve) => requestAnimationFrame(resolve));
button.onclick = async () => {
  button.disabled = true;
  snapshot.disabled = true;
  stop.disabled = false;
  quality.disabled = scope.disabled = true;
  cancelled = false;
  const results: unknown[] = [];
  const report = {
    measuredAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
    devicePixelRatio,
    quality: quality.value,
    framesPerCase: 300,
    note: "Local browser render test, not an end-to-end load or gameplay test. CPU times measure submission, not GPU execution. Characters sample the map while mechanisms animate; no playability conclusion is implied. First render is measured separately, with no warm-up exclusion.",
    results,
  };
  const publish = () => {
    output.textContent = JSON.stringify(report, null, 2);
  };
  try {
    const cases =
      scope.value === "full" ? RENDER_CASES : RENDER_CASES.slice(0, 3);
    for (const [mode, level] of cases) {
      if (cancelled || document.hidden)
        throw new Error("测试已停止；后台帧不计入结果");
      const constructed = performance.now();
      let contextInterrupted = false;
      const scene = new PaperScene(canvas, {
        quality: qualityMode(quality.value),
        onContextStatus: () => {
          contextInterrupted = true;
        },
      });
      const constructorCpuMs = performance.now() - constructed;
      const game = newGame(mode, level);
      const cpu: number[] = [],
        intervals: number[] = [],
        calls: number[] = [];
      let last = await nextFrame();
      status.textContent = `${mode} 人 · 第 ${level + 1} 关`;
      try {
        const firstStarted = performance.now();
        scene.render(game, 0, 1 / 60);
        const firstRenderCpuMs = performance.now() - firstStarted;
        const firstPresented = await nextFrame();
        if (contextInterrupted)
          throw new Error("图形上下文中断；本组结果已丢弃");
        const firstFrameIntervalMs = firstPresented - last;
        last = firstPresented;
        // Covers loading the map as well as traversing its different regions.
        const platforms = LEVELS[level].platforms;
        for (let i = 0; i < 300; i++) {
          const now = await nextFrame();
          if (contextInterrupted)
            throw new Error("图形上下文中断；本组结果已丢弃");
          if (cancelled || document.hidden)
            throw new Error("测试已停止；后台帧不计入结果");
          game.time = game.motionTime = i / 60;
          game.view = i % 150 < 75 ? 0 : 1;
          const at = platforms[Math.floor((i / 300) * platforms.length)];
          for (const [index, player] of game.players.entries()) {
            player.x = at.x + (index % 3) * 0.15;
            player.y = at.y;
            player.z = at.z - Math.floor(index / 3) * 0.15;
          }
          const started = performance.now();
          scene.render(game, 0, 1 / 60);
          cpu.push(performance.now() - started);
          intervals.push(now - last);
          calls.push(scene.renderer.info.render.calls);
          last = now;
        }
        results.push({
          mode,
          level: level + 1,
          constructorCpuMs: +constructorCpuMs.toFixed(2),
          firstRenderCpuMs: +firstRenderCpuMs.toFixed(2),
          firstFrameIntervalMs: +firstFrameIntervalMs.toFixed(2),
          cpuMs: summarize(cpu),
          frameMs: summarize(intervals),
          drawCalls: summarize(calls),
          geometries: scene.renderer.info.memory.geometries,
          textures: scene.renderer.info.memory.textures,
        });
        publish();
      } finally {
        scene.dispose();
      }
    }
    status.textContent = "测试完成";
  } catch (e) {
    status.textContent = `失败：${String(e)}`;
  } finally {
    button.disabled = false;
    snapshot.disabled = false;
    stop.disabled = true;
    quality.disabled = scope.disabled = false;
  }
};

snapshot.onclick = async () => {
  const scene = new PaperScene(canvas);
  try {
    await nextFrame();
    await nextFrame();
    const game = newGame(1);
    scene.renderer.setPixelRatio(1);
    scene.renderer.setSize(960, 540, false);
    for (let i = 0; i < 45; i++) scene.render(game, 0, 1 / 60, true);
    const data = document.querySelector<HTMLTextAreaElement>("#snapshot-data")!;
    data.style.display = "block";
    data.value = canvas.toDataURL("image/webp", 0.8);
  } finally {
    scene.dispose();
  }
};
