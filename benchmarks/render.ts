import { PaperScene } from "../src/scene";
import { newGame } from "../src/game";
const canvas = document.querySelector("canvas")!;
const button = document.querySelector("button")!;
const status = document.querySelector("#status")!;
const output = document.querySelector("#result")!;
const nextFrame = () =>
  new Promise<number>((resolve) => requestAnimationFrame(resolve));
button.onclick = async () => {
  button.disabled = true;
  const results: unknown[] = [];
  try {
    for (const [mode, level] of [
      [1, 0],
      [6, 10],
      [6, 11],
    ] as const) {
      const scene = new PaperScene(canvas),
        game = newGame(mode, level);
      const cpu: number[] = [],
        intervals: number[] = [],
        calls: number[] = [];
      let last = await nextFrame();
      status.textContent = `${mode} 人 · 第 ${level + 1} 关`;
      try {
        for (let i = 0; i < 180; i++) {
          const now = await nextFrame();
          game.time = game.motionTime = i / 60;
          game.view = i < 100 ? 0 : 1;
          const started = performance.now();
          scene.render(game, 0, 1 / 60);
          if (i >= 30) {
            cpu.push(performance.now() - started);
            intervals.push(now - last);
            calls.push(scene.renderer.info.render.calls);
          }
          last = now;
        }
        const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
        results.push({
          mode,
          level: level + 1,
          cpuMs: +mean(cpu).toFixed(2),
          frameMs: +mean(intervals).toFixed(2),
          drawCalls: Math.round(mean(calls)),
          geometries: scene.renderer.info.memory.geometries,
          textures: scene.renderer.info.memory.textures,
        });
        output.textContent = JSON.stringify(results, null, 2);
      } finally {
        scene.dispose();
      }
    }
    status.textContent = "测试完成";
  } catch (e) {
    status.textContent = `失败：${String(e)}`;
  } finally {
    button.disabled = false;
  }
};

const snapshot = document.querySelector<HTMLButtonElement>("#snapshot")!;
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
