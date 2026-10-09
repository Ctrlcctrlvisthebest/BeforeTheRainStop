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
const editingSelector =
  'input,select,textarea,[contenteditable]:not([contenteditable="false"])';
const popupSelector =
  '[role="combobox"],[role="listbox"],[role="option"],[role="menu"],[role^="menuitem"]';
const interactiveSelector =
  `${editingSelector},${popupSelector},button,summary,a[href],area[href],` +
  '[role="button"],[role="slider"],[role="spinbutton"],[role="switch"],' +
  '[role="checkbox"],[role="radio"],[role="textbox"],[role="searchbox"],[role="tab"]';

const interactiveTarget = (target: EventTarget | null, selector: string) =>
  (target as Element | null)?.closest?.(selector);

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
  const clearKeyboard = () => {
    restartHeld = false;
    keyboard.clear();
  };
  const clear = () => {
    clearKeyboard();
    options.clear?.();
    options.change?.();
  };
  const focus = (e: FocusEvent) => {
    if (!interactiveTarget(e.target, interactiveSelector)) return;
    // Taking focus into UI retires the old keyboard hold. A finger still
    // holding a touch control remains independent of this keyboard transition.
    clearKeyboard();
    options.change?.();
  };
  const down = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    const code = gameKeyCode(e);
    if (code === "Escape") {
      // Escape closes selectors/editing controls without opening game help.
      // Ordinary buttons (including the help button) may still close help.
      if (interactiveTarget(e.target, `${editingSelector},${popupSelector}`))
        return;
      if (!e.repeat) {
        clear();
        options.escape();
      }
      return;
    }
    // Buttons, summaries and custom controls own their native keyboard
    // activation/navigation, even when a run continues behind the menu.
    if (interactiveTarget(e.target, interactiveSelector)) return;
    if (!options.enabled()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (code === "KeyT" && options.restart) {
      if (e.shiftKey) return;
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
  // Release first, before a selector or overlay can stop bubbling. Keyup
  // must also release holds that began on the canvas before focus moved.
  window.addEventListener("keyup", up, true);
  window.addEventListener("blur", clear);
  document.addEventListener("focusin", focus, true);
  document.addEventListener("visibilitychange", clear);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up, true);
    window.removeEventListener("blur", clear);
    document.removeEventListener("focusin", focus, true);
    document.removeEventListener("visibilitychange", clear);
    clear();
  };
}
