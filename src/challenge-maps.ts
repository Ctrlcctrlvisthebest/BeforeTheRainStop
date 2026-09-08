import ember from "./maps/09-ember-intervals.json";
import wind from "./maps/10-thread-of-wind.json";
import bridge from "./maps/11-downpour-bridge.json";
import lantern from "./maps/12-last-lantern.json";
import eaves from "./maps/13-ferry-beyond-eaves.json";
import bells from "./maps/14-broken-bells.json";
import ferries from "./maps/15-twin-ferries.json";
import gallery from "./maps/16-folded-rain-gallery.json";
import light from "./maps/17-before-first-light.json";
import { parseMap } from "./map-format";

// Add editor exports here. Terrain, weather, bridges, guides and translations
// are all registered from the same versioned file on the client and server.
export const CHALLENGE_MAPS = [
  ember,
  wind,
  bridge,
  lantern,
  eaves,
  bells,
  ferries,
  gallery,
  light,
].map(parseMap);
export const CHALLENGE_START = 8;
export const MAP_TRANSLATIONS = Object.assign(
  {},
  ...CHALLENGE_MAPS.map((m) => m.translations ?? {}),
) as Record<string, string>;
