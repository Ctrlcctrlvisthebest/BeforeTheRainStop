import type { Point } from "./game";

// Ordinary steps, turns and jumps fit inside this stationary viewing area.
const DEAD_ZONE = 2.5;

function trackAxis(focus: number, position: number, radius: number): number {
  return Math.max(position - radius, Math.min(position + radius, focus));
}

export function updateCameraFocus(
  focus: Point,
  player: Point,
  reset: boolean,
): void {
  const radius = reset ? 0 : DEAD_ZONE;
  focus.x = trackAxis(focus.x, player.x, radius);
  focus.y = trackAxis(focus.y, Math.max(1.3, player.y + 1.3), radius);
  focus.z = trackAxis(focus.z, player.z, radius);
}
