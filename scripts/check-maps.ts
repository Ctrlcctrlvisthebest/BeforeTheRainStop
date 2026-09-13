import { LEVELS } from "../src/game";
import { WEATHER } from "../src/weather";
import { CROSSINGS } from "../src/bridges";
import { GUIDE_ROUTES } from "../src/guide";
import { validateMap } from "../src/map-format";
import { interactiveModules } from "../src/map-rules";

for (const [index, level] of LEVELS.entries()) {
  const map = {
    format: "before-the-rain-map" as const,
    version: 1 as const,
    chapter: index + 1,
    level,
    weather: WEATHER[index],
    crossing: CROSSINGS[index],
    route: GUIDE_ROUTES[index],
  };
  const report = validateMap(map, index + 1);
  if (report.errors.length)
    throw new Error(
      `第 ${index + 1} 关「${level.name}」\n${report.errors.join("\n")}`,
    );
  console.log(
    `${String(index + 1).padStart(2, "0")} ${level.name}：平台与连续直路 ≤ 9，独立互动 ${interactiveModules(map).length}`,
  );
}
