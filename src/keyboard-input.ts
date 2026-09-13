import { TouchInput, type TouchField } from "./touch-input";

const bindings: Record<string, readonly [TouchField, number | boolean]> = {
  ArrowLeft: ["axis", -1],
  KeyA: ["axis", -1],
  ArrowRight: ["axis", 1],
  KeyD: ["axis", 1],
  Space: ["jump", true],
  ArrowUp: ["jump", true],
  KeyW: ["jump", true],
  ShiftLeft: ["fold", true],
  ShiftRight: ["fold", true],
  Shift: ["fold", true],
  KeyB: ["fold", true],
  KeyQ: ["turn", true],
  KeyE: ["turn", true],
  KeyR: ["reset", true],
  KeyS: ["shelter", true],
  ArrowDown: ["shelter", true],
  KeyF: ["repair", true],
};
const codes = Object.keys(bindings);

// Some embedded browsers omit code (or report "Unidentified"). Prefer the
// physical key for keyboard layouts, then fall back to key and legacy keyCode.
export function gameKeyCode(e: KeyboardEvent): string {
  if (
    (e.code !== "Shift" && Object.hasOwn(bindings, e.code)) ||
    e.code === "Escape" ||
    e.code === "KeyT"
  )
    return e.code;
  if (e.code && e.code !== "Unidentified" && e.code !== "Shift") return e.code;
  const key = e.key || "";
  if (key === "Shift" || e.code === "Shift" || e.keyCode === 16)
    return e.location === 1
      ? "ShiftLeft"
      : e.location === 2
        ? "ShiftRight"
        : "Shift";
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (key === " " || key === "Spacebar") return "Space";
  if (key === "Esc") return "Escape";
  if (key && key !== "Unidentified") return key;
  const legacy: Record<number, string> = {
    27: "Escape",
    32: "Space",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
  };
  return (
    legacy[e.keyCode] ||
    (e.keyCode >= 65 && e.keyCode <= 90
      ? `Key${String.fromCharCode(e.keyCode)}`
      : "")
  );
}

/** Keyboard aliases share touch's tap timing, but count each direction once. */
export class KeyboardInput {
  private held = new Set<string>();
  private buttons = new TouchInput();
  down(code: string, now: number, repeat = false) {
    if (!Object.hasOwn(bindings, code) || repeat || this.held.has(code))
      return false;
    this.held.add(code);
    const [field, value] = bindings[code];
    if (field !== "axis")
      this.buttons.press(codes.indexOf(code), field, value, now);
    return true;
  }
  up(code: string, now: number) {
    if (!this.held.delete(code)) return;
    this.buttons.release(codes.indexOf(code), now);
  }
  clear() {
    this.held.clear();
    this.buttons.clear();
  }
  read(now: number) {
    const input = this.buttons.read(now);
    input.axis =
      Number(this.held.has("ArrowRight") || this.held.has("KeyD")) -
      Number(this.held.has("ArrowLeft") || this.held.has("KeyA"));
    return input;
  }
}

export function bindGameKeyboard(
  keyboard: KeyboardInput,
  options: {
    enabled: () => boolean;
    escape: () => void;
    change?: () => void;
    clear?: () => void;
    jump?: () => void;
    restart?: () => void;
  },
) {
  let restartHeld = false;
  const clear = () => {
    restartHeld = false;
    keyboard.clear();
    options.clear?.();
    options.change?.();
  };
  const down = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement)?.closest?.(
        "input,select,textarea,[contenteditable='true']",
      )
    )
      return;
    const code = gameKeyCode(e);
    if (code === "Escape") {
      if (!e.repeat) {
        clear();
        options.escape();
      }
      return;
    }
    if (!options.enabled()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (code === "KeyT" && options.restart) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (!e.repeat && !restartHeld) {
        clear();
        restartHeld = true;
        options.restart();
      }
      return;
    }
    if (!Object.hasOwn(bindings, code)) return;
    e.preventDefault();
    if (keyboard.down(code, performance.now(), e.repeat)) {
      if (bindings[code][0] === "jump") options.jump?.();
      options.change?.();
    }
  };
  const up = (e: KeyboardEvent) => {
    const code = gameKeyCode(e),
      now = performance.now();
    if (code === "KeyT") restartHeld = false;
    keyboard.up(code, now);
    // A release may omit the location supplied on keydown. shiftKey=false
    // confirms that neither Shift is held; B remains an independent bridge key.
    if (code.startsWith("Shift") && e.shiftKey === false)
      for (const shift of ["Shift", "ShiftLeft", "ShiftRight"])
        keyboard.up(shift, now);
    options.change?.();
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", clear);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clear);
    document.removeEventListener("visibilitychange", clear);
    clear();
  };
}
