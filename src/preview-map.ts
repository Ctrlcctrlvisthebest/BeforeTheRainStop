import { LEVELS } from "./game";
import {
  WEATHER,
  CAMPFIRES,
  firesForWeather,
  BLAZE_ROOFS,
  blazeRoofsFor,
} from "./weather";
import { CROSSINGS } from "./bridges";
import { GUIDE_ROUTES } from "./guide";
import type { MapFile } from "./map-format";

/** Preview registrations are temporary, including when WebGL cannot start. */
export function installPreviewMap(map: MapFile) {
  const index = LEVELS.length;
  const restores: (() => void)[] = [];
  const put = <T>(registry: Record<number, T>, value: T | undefined) => {
    const previous = registry[index],
      existed = Object.hasOwn(registry, index);
    const length = Array.isArray(registry) ? registry.length : undefined;
    if (value === undefined) delete registry[index];
    else registry[index] = value;
    restores.push(() => {
      if (existed) registry[index] = previous;
      else delete registry[index];
      if (length !== undefined && Array.isArray(registry))
        registry.length = length;
    });
  };
  put(LEVELS, structuredClone(map.level));
  put(WEATHER, structuredClone(map.weather));
  put(CAMPFIRES, firesForWeather(map.weather));
  put(BLAZE_ROOFS, blazeRoofsFor(map.level));
  put(GUIDE_ROUTES, structuredClone(map.route));
  put(CROSSINGS, map.crossing && structuredClone(map.crossing));
  return {
    index,
    restore: () => {
      restores
        .splice(0)
        .reverse()
        .forEach((fn) => fn());
    },
  };
}
