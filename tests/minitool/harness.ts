import "../../src/minitool/compat";
import { PaperScene } from "../../src/minitool/scene-loader";
import { LEVELS, newGame } from "../../src/game";
import { GUIDE_ROUTES } from "../../src/guide";

const select = document.querySelector("select")!;
const output = document.querySelector("output")!;
const canvas = document.querySelector("canvas")!;
let scene = new PaperScene(canvas),
  game = newGame(1),
  running = true;
LEVELS.forEach((l, i) =>
  select.add(new Option(`${i + 1} · ${l.name}`, String(i))),
);
select.addEventListener("change", () => {
  game = newGame(1, Number(select.value), `qa-${Date.now()}`);
});
document.querySelector("#turn")!.addEventListener("click", () => {
  game.view = game.view === 0 ? 1 : 0;
});
document.querySelector("#loss")!.addEventListener("click", () => {
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
});
document.querySelector("#sweep")!.addEventListener("click", async () => {
  running = false;
  let samples = 0,
    webgl = 0,
    maxCalls = 0,
    maxTriangles = 0;
  try {
    for (let level = 0; level < LEVELS.length; level++) {
      scene.dispose();
      scene = new PaperScene(canvas);
      const map = LEVELS[level],
        points = [
          map.spawn,
          ...map.keys,
          ...map.stars,
          ...map.checkpoints,
          ...GUIDE_ROUTES[level].map((s) => s.target),
          map.exit,
        ];
      for (const point of points)
        for (const view of [0, 1] as const) {
          game = newGame(1, level, `sample-${samples}`);
          Object.assign(game.players[0], point);
          game.view = view;
          game.gateCharge = 2;
          game.bridgeCharge = 1;
          game.motionTime = 3;
          game.time = 3;
          // Repeated frames must retain the shared 3D renderer.
          for (let pass = 0; pass < 3; pass++)
            scene.render(game, 0, 1 / 30, false, "zh", point, true);
          webgl++;
          maxCalls = Math.max(maxCalls, scene.renderer.info.render.calls);
          maxTriangles = Math.max(
            maxTriangles,
            scene.renderer.info.render.triangles,
          );
          samples++;
        }
      output.textContent = `检查中 ${level + 1}/40 · ${samples} 处`;
      await new Promise(requestAnimationFrame);
    }
    output.textContent = `通过：40 关 · ${samples} 处双视角取样 · 3D ${webgl} · 最大提交 ${maxCalls} · 最大三角形 ${maxTriangles}`;
  } catch (error) {
    output.textContent = `失败：${error}`;
  }
  running = true;
});
let last = 0;
function frame(now: number) {
  if (running && !document.hidden && now - last > 33) {
    last = now;
    scene.render(game, 0, 1 / 30, false, "zh", undefined, true);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
