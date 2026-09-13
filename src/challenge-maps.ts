import chapter40 from "./maps/40-beyond-the-last-rain.json";
import chapter39 from "./maps/39-night-watch.json";
import chapter38 from "./maps/38-storm-loom.json";
import chapter37 from "./maps/37-suspended-cipher.json";
import chapter36 from "./maps/36-three-leaf-tide.json";
import chapter35 from "./maps/35-needle-eye.json";
import chapter34 from "./maps/34-reverse-waterfall.json";
import chapter33 from "./maps/33-four-season-rigging.json";
import chapter32 from "./maps/32-cloud-dovetail.json";
import chapter31 from "./maps/31-broken-score.json";
import chapter30 from "./maps/30-sealed-skywalk.json";
import chapter29 from "./maps/29-ember-docks.json";
import chapter28 from "./maps/28-sky-stitch.json";
import chapter18 from "./maps/18-wishing-ring.json";
import chapter19 from "./maps/19-cross-current.json";
import chapter20 from "./maps/20-lantern-workshop.json";
import chapter21 from "./maps/21-return-to-the-gate.json";
import chapter22 from "./maps/22-falling-letter.json";
import chapter23 from "./maps/23-out-of-time.json";
import chapter24 from "./maps/24-broken-eaves.json";
import chapter25 from "./maps/25-two-postmarks.json";
import chapter26 from "./maps/26-rain-weave.json";
import chapter27 from "./maps/27-dawn-spiral.json";
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
  chapter18,
  chapter19,
  chapter20,
  chapter21,
  chapter22,
  chapter23,
  chapter24,
  chapter25,
  chapter26,
  chapter27,
  chapter28,
  chapter29,
  chapter30,
  chapter31,
  chapter32,
  chapter33,
  chapter34,
  chapter35,
  chapter36,
  chapter37,
  chapter38,
  chapter39,
  chapter40,
].map((map, index) => parseMap(map, index + 9));
export const CHALLENGE_START = 8;
export const MAP_TRANSLATIONS = Object.assign(
  {},
  ...CHALLENGE_MAPS.map((m) => m.translations ?? {}),
) as Record<string, string>;
