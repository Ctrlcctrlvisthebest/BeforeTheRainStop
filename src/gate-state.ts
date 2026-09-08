import { LEVELS, type Bird, type Game, type Point } from "./game";

// Match the simulation's pressure-plate bounds when explaining its current state.
export function isOnGatePad(player: Bird, pad: Point): boolean {
  return (
    !player.arrived &&
    Math.hypot(player.x - pad.x, player.z - pad.z) < 0.75 &&
    Math.abs(player.y - pad.y) < 0.4
  );
}

export function gateState(g: Game) {
  const pads = LEVELS[g.level].pads.slice(
    0,
    Math.min(g.mode, LEVELS[g.level].pads.length),
  );
  const pressed = pads.map((pad) =>
    g.players.some((player) => isOnGatePad(player, pad)),
  );
  return {
    pads,
    pressed,
    required: pads.length,
    occupied: pressed.filter(Boolean).length,
    remaining: (Math.ceil(Math.max(0, 4 - g.gateCharge) * 10) / 10).toFixed(1),
  };
}

export function gateStatusCopy(g: Game): readonly [string, string] {
  if (g.gateOpen)
    return ["闸门已开 · 可以离开踏板", "Gate open · Leave the plates"];
  const state = gateState(g);
  if (state.occupied < state.required)
    return [
      `开门踏板 ${state.occupied}/${state.required} · 还差 ${state.required - state.occupied} 人`,
      `Gate plates ${state.occupied}/${state.required} · Need ${state.required - state.occupied} more`,
    ];
  return [
    `保持踩住 · 开门还需 ${state.remaining} 秒`,
    `Keep holding · Gate opens in ${state.remaining}s`,
  ];
}
