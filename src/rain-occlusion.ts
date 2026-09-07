export interface RainCover {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

/** Call once for fixed scenery; only moving covers need checking each frame. */
export function rainFloorAt(
  seed: { x: number; z: number },
  covers: readonly RainCover[],
  floor = -2.5,
) {
  for (const cover of covers) {
    if (
      Math.abs(seed.x - cover.x) < cover.w / 2 &&
      Math.abs(seed.z - cover.z) < cover.d / 2
    )
      floor = Math.max(floor, cover.top);
  }
  return floor;
}
