import { EXTRA_WEATHER } from "./chapters";
import { CHALLENGE_MAPS } from "./challenge-maps";
import type { Point, Level } from "./game";
export interface RainZone {
  x: number;
  z: number;
  w: number;
  d: number;
  rate: number;
}
export interface Awning extends Point {
  w: number;
  d: number;
  floor?: number;
}
export interface Weather {
  zones: RainZone[];
  awnings: Awning[];
  period: number;
}
const start: Awning = { x: 0.5, y: 3.4, z: 0, w: 7, d: 3.8 };
export const WEATHER: Weather[] = [
  {
    period: 12,
    zones: [
      { x: 8, z: 0, w: 11, d: 4, rate: 10 },
      { x: 11, z: -4, w: 4, d: 6, rate: 15 },
      { x: 22, z: -7, w: 17, d: 4, rate: 17 },
    ],
    awnings: [
      start,
      { x: 10, y: 3.4, z: 0, w: 2.6, d: 3.6 },
      { x: 16, y: 3.4, z: -7, w: 3.2, d: 3.6 },
      { x: 28.5, y: 3.4, z: -7, w: 3.4, d: 3.6 },
    ],
  },
  {
    period: 10,
    zones: [
      { x: 8, z: 0, w: 11, d: 4, rate: 12 },
      { x: 11, z: -4, w: 4, d: 6, rate: 17 },
      { x: 22, z: -7, w: 17, d: 4, rate: 21 },
    ],
    awnings: [
      start,
      { x: 8, y: 3.5, z: 0, w: 2.4, d: 3.6 },
      { x: 17.5, y: 3.4, z: -7, w: 1.4, d: 3.6 },
      { x: 28.5, y: 3.4, z: -7, w: 3.4, d: 3.6 },
    ],
  },
  {
    period: 11,
    zones: [
      { x: 8, z: 0, w: 11, d: 4, rate: 6 },
      { x: 11, z: -4, w: 4, d: 6, rate: 12 },
      { x: 22, z: -7, w: 17, d: 4, rate: 20 },
    ],
    awnings: [
      start,
      { x: 17, y: 4.6, z: -7, w: 3.6, d: 3.6, floor: 1.2 },
      { x: 28.5, y: 4.6, z: -7, w: 3.4, d: 3.6, floor: 1.2 },
    ],
  },
  {
    period: 9,
    zones: [
      { x: 8, z: 0, w: 11, d: 4, rate: 15 },
      { x: 11, z: -4.5, w: 4, d: 7, rate: 20 },
      { x: 23, z: -8, w: 20, d: 4, rate: 23 },
    ],
    awnings: [
      start,
      { x: 8, y: 3.5, z: 0, w: 2.8, d: 3.6 },
      { x: 15, y: 3.5, z: -8, w: 2.8, d: 3.6 },
      { x: 27, y: 3.4, z: -8, w: 1.3, d: 3.6 },
      { x: 31, y: 3.4, z: -8, w: 2.9, d: 3.6 },
    ],
  },
  ...EXTRA_WEATHER,
  ...CHALLENGE_MAPS.map((m) => m.weather),
];
export const FIRE_DRY_RATE = 26;
export const FIRE_HEAT_RATE = 12.5;
export const FIRE_COOL_RATE = 22;
export const FIRE_WARNING = 65;
export const BLAZE_HEIGHT = 0.85;
export const firesForWeather = (weather: Weather) =>
  weather.awnings.map((a, i) => ({
    // Keep the starting fire behind the spawn, so waiting for friends is safe.
    x: i === 0 ? a.x - a.w / 2 + 0.95 : a.x,
    y: a.floor ?? 0,
    z: a.z - (i === 0 ? 1.1 : 0.95),
    radius: 1.45,
  }));
export const CAMPFIRES = WEATHER.map(firesForWeather);
// Hazard roofs are derived separately: adding a blaze must not also add a
// drying fire. The same derived cover is used for collision rules and drawing.
export const BLAZE_ROOFS: Awning[][] = [];
export const blazeRoofsFor = (level: Level): Awning[] =>
  level.hazards.map((h) => ({
    x: h.x,
    z: h.z,
    y: h.y + 3.4,
    w: h.w + 0.6,
    d: h.d + 0.6,
    floor: h.y,
  }));
export function besideCampfire(level: number, p: Point): boolean {
  return CAMPFIRES[level].some(
    (f) =>
      Math.hypot(p.x - f.x, p.z - f.z) < f.radius &&
      p.y >= f.y - 0.3 &&
      p.y < f.y + 0.9,
  );
}
export function rainStrength(level: number, t: number): number {
  return t % WEATHER[level].period < WEATHER[level].period * 0.38 ? 1.45 : 0.75;
}
export function rainfall(level: number, p: Point, t: number): number {
  return Math.max(
    0,
    ...WEATHER[level].zones
      .filter(
        (r) => Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2,
      )
      .map((r) => r.rate * rainStrength(level, t)),
  );
}
export function underAwning(level: number, p: Point): boolean {
  return [...WEATHER[level].awnings, ...(BLAZE_ROOFS[level] ?? [])].some(
    (r) =>
      p.y + 0.88 < r.y &&
      Math.abs(p.x - r.x) < r.w / 2 &&
      Math.abs(p.z - r.z) < r.d / 2,
  );
}
export const SHIELD_RADIUS = 2.6;
