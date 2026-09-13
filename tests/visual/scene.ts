import { LEVELS, newGame, type Mode } from "../../src/game";
import { GUIDE_ROUTES } from "../../src/guide";
import { PaperScene } from "../../src/scene";
import { bankPoint, CROSSINGS } from "../../src/bridges";
import type { Language } from "../../src/i18n";
import { probeTransparency } from "./transparency-probe";
import { probeTerrain } from "./terrain-probe";

const select = (id: string) =>
  document.getElementById(id) as unknown as HTMLSelectElement;
const chapter = select("chapter"),
  mode = select("mode"),
  location = select("location"),
  view = select("view"),
  local = select("local"),
  interaction = select("interaction"),
  language = select("language"),
  motion = select("motion");
LEVELS.forEach((level, index) =>
  chapter.add(new Option(`${index + 1} · ${level.name}`, String(index))),
);
chapter.value = "12";
const scene = new PaperScene(document.querySelector("canvas")!);
let revision = 0;
let game = newGame(1, 12);
let points = [LEVELS[12].spawn];
let anchors = game.players.map((p) => ({ x: p.x, y: p.y, z: p.z }));
let motionStart = performance.now();

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
  const crossing = CROSSINGS[game.level],
    map = LEVELS[game.level];
  const action = interaction.value;
  if (
    crossing &&
    ["aligned", "offset", "bridge", "release", "bridged"].includes(action)
  ) {
    const bank = bankPoint(
      crossing,
      action === "release" ? (crossing.near === -1 ? 1 : -1) : crossing.near,
    );
    game.view = crossing.axis === "x" ? 0 : 1;
    view.value = String(game.view);
    game.players.forEach((p, i) =>
      Object.assign(p, bank, {
        [crossing.axis]: bank[crossing.axis] + i * crossing.near,
      }),
    );
    if (action === "offset")
      game.players[0][crossing.axis === "x" ? "z" : "x"] += 0.8;
    if (action === "bridge")
      Object.assign(game.players[0], crossing, {
        y: crossing.y - 0.28,
        bridgeDock: true,
        bridgeFrom: crossing.near,
        bridgeAxis: crossing.axis,
        folded: true,
        foldsLeft: 5,
      });
    game.bridgeCharge =
      action === "release" || (action === "bridge" && game.mode === 1)
        ? 0.9
        : 0;
    game.bridgeLatched = action === "bridged";
  }
  if (["gate-wait", "gate", "opened"].includes(action) && map.pads.length) {
    const pads = map.pads;
    game.players.forEach((p, i) =>
      Object.assign(p, pads[Math.min(i, pads.length - 1)], {
        x:
          pads[Math.min(i, pads.length - 1)].x +
          (action === "gate-wait" && i > 0 ? 1.2 : 0),
      }),
    );
    game.gateCharge = action === "gate" ? 2.3 : 0;
    game.gateOpen = action === "opened";
  }
  if (action === "repair" || action === "repaired")
    game.players.forEach((p) =>
      Object.assign(p, map.spawn, {
        foldsLeft: action === "repair" ? 3 : 6,
        repairProgress: action === "repair" ? 0.8 : 2,
      }),
    );
  local.disabled = game.mode === 1;
  anchors = game.players.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  motionStart = performance.now();
}
chapter.addEventListener("change", loadLocations);
mode.addEventListener("change", loadGame);
location.addEventListener("change", loadGame);
local.addEventListener("change", loadGame);
interaction.addEventListener("change", loadGame);
motion.addEventListener("change", loadGame);
view.addEventListener("change", () => {
  game.view = Number(view.value) as 0 | 1;
});
document.querySelector("#turn")!.addEventListener("click", () => {
  game.view = game.view === 0 ? 1 : 0;
  view.value = String(game.view);
});
loadLocations();
document.querySelector("#probe")!.addEventListener("click", async () => {
  const output = document.querySelector("#probe-result")!;
  output.textContent = "正在检查 GPU 重叠面…";
  try {
    const result = await probeTerrain();
    output.textContent = `${result.pairs} 处重叠 · 原始不稳定 ${result.unstableBefore} · 修复后不稳定 ${result.unstableAfter}${result.failures.length ? ` · ${result.failures.join(",")}` : ""}`;
  } catch (error) {
    output.textContent = `检查失败：${error}`;
  }
});
let previous = performance.now();
function frame(now: number) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  game.motionTime += dt;
  const elapsed = (now - motionStart) / 1000;
  if (motion.value === "turn") {
    game.view = (Math.floor(elapsed / 2) % 2) as 0 | 1;
    view.value = String(game.view);
  }
  if (motion.value === "jitter" || motion.value === "walk") {
    const offset =
      Math.sin(elapsed * (motion.value === "jitter" ? 40 : 1)) *
      (motion.value === "jitter" ? 0.025 : 2);
    game.players.forEach((p, i) => {
      p.x = anchors[i].x + offset;
      p.z = anchors[i].z + offset;
    });
  }
  scene.render(
    game,
    game.mode === 1 ? 0 : Number(local.value),
    dt,
    false,
    language.value as Language,
    undefined,
    window.innerWidth < 900,
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => scene.dispose(), { once: true });

document.querySelector("#transparency")!.addEventListener("click", () => {
  const result = probeTransparency();
  document.querySelector("#transparency-result")!.textContent =
    `${result.checks} 项 GPU 检查 · ${result.failures.length ? result.failures.join("; ") : "全部通过"}`;
});
