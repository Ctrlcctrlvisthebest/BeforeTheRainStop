import { LEVELS, newGame, type Mode } from "../../src/game";
import { GUIDE_ROUTES } from "../../src/guide";
import { PaperScene } from "../../src/scene";

const select = (id: string) =>
  document.getElementById(id) as unknown as HTMLSelectElement;
const chapter = select("chapter"),
  mode = select("mode"),
  location = select("location"),
  view = select("view"),
  local = select("local");
LEVELS.forEach((level, index) =>
  chapter.add(new Option(`${index + 1} · ${level.name}`, String(index))),
);
chapter.value = "12";
const scene = new PaperScene(document.querySelector("canvas")!);
let revision = 0;
let game = newGame(1, 12);
let points = [LEVELS[12].spawn];

function loadLocations() {
  const index = Number(chapter.value),
    level = LEVELS[index];
  const entries = [
    { name: "出生点", point: level.spawn },
    ...level.checkpoints.map((point, i) => ({
      name: `存档点 ${i + 1}`,
      point,
    })),
    ...GUIDE_ROUTES[index].map((step, i) => ({
      name: `路线 ${i + 1} · ${step.kind}`,
      point: step.target,
    })),
    { name: "终点", point: level.exit },
  ];
  location.replaceChildren(
    ...entries.map((entry, i) => new Option(entry.name, String(i))),
  );
  points = entries.map((entry) => entry.point);
  loadGame();
}
function loadGame() {
  game = newGame(
    Number(mode.value) as Mode,
    Number(chapter.value),
    `visual-${++revision}`,
  );
  const point = points[Number(location.value)];
  game.players.forEach((player, i) =>
    Object.assign(player, point, { x: point.x + i * 0.75 }),
  );
  game.view = Number(view.value) as 0 | 1;
  local.disabled = game.mode === 1;
}
chapter.addEventListener("change", loadLocations);
mode.addEventListener("change", loadGame);
location.addEventListener("change", loadGame);
local.addEventListener("change", loadGame);
view.addEventListener("change", () => {
  game.view = Number(view.value) as 0 | 1;
});
document.querySelector("#turn")!.addEventListener("click", () => {
  game.view = game.view === 0 ? 1 : 0;
  view.value = String(game.view);
});
loadLocations();
let previous = performance.now();
function frame(now: number) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  game.motionTime += dt;
  scene.render(game, game.mode === 1 ? 0 : Number(local.value), dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => scene.dispose(), { once: true });
