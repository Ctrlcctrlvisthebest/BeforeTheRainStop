import { idleInput, type Input } from "./game";

export type TouchField = keyof Input;
type Press = {
  field: TouchField;
  value: number | boolean;
  started: number;
  until?: number;
};

// Track fingers independently: lifting one must not release another button.
export class TouchInput {
  private presses = new Map<number, Press>();

  press(id: number, field: TouchField, value: number | boolean, now: number) {
    const held = this.presses.get(id);
    if (
      held?.field === field &&
      held.value === value &&
      held.until === undefined
    )
      return;
    this.presses.set(id, { field, value, started: now });
  }

  release(id: number, now: number) {
    const press = this.presses.get(id);
    if (!press || press.until !== undefined) return;
    // A quick tap must survive one simulation/network tick. Held transforms
    // release immediately so paper cannot stay unfolded after the finger lifts.
    if (
      ["jump", "turn", "reset"].includes(press.field) &&
      now - press.started < 120
    )
      press.until = press.started + 120;
    else this.presses.delete(id);
  }

  cancel(id: number) {
    // Normal pointerup is followed by lostpointercapture; retain its tap pulse.
    if (this.presses.get(id)?.until === undefined) this.presses.delete(id);
  }

  clear() {
    this.presses.clear();
  }

  read(now: number): Input {
    const result = idleInput();
    let left = false,
      right = false;
    for (const [id, press] of this.presses) {
      if (press.until !== undefined && now >= press.until) {
        this.presses.delete(id);
        continue;
      }
      if (press.field === "axis") {
        left ||= Number(press.value) < 0;
        right ||= Number(press.value) > 0;
      } else result[press.field] ||= Boolean(press.value);
    }
    result.axis = Number(right) - Number(left);
    return result;
  }
}

export function mergeInput(keyboard: Input, touch: Input): Input {
  return {
    axis: Math.sign(keyboard.axis + touch.axis),
    jump: keyboard.jump || touch.jump,
    fold: keyboard.fold || touch.fold,
    turn: keyboard.turn || touch.turn,
    reset: keyboard.reset || touch.reset,
    shelter: keyboard.shelter || touch.shelter,
    repair: keyboard.repair || touch.repair,
  };
}
