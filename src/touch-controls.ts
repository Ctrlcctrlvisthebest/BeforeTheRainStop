import { TouchInput, type TouchField } from "./touch-input";

type Contact = {
  id: number;
  button: HTMLButtonElement;
  field: TouchField;
  value: number | boolean;
  pointerType?: string;
};

/** Use the browser's live TouchList on phones, with Pointer Events for mice,
 * pens and touch browsers without Touch Events. End events are observed at the
 * window even when the finger leaves the button or pointer capture fails. */
export function bindTouchControls(
  root: HTMLElement,
  input: TouchInput,
  change: () => void = () => {},
) {
  const doc = root.ownerDocument,
    win = doc.defaultView!;
  const fingers = new Map<number, Contact>();
  const pointers = new Map<number, Contact>();
  let nextId = 0,
    nativeTouch = "ontouchstart" in win;
  const now = () => win.performance.now();
  const buttonFrom = (target: EventTarget | null) => {
    const button = (target as Element | null)?.closest?.<HTMLButtonElement>(
      "button[data-touch-field]",
    );
    return button && root.contains(button) && !button.disabled ? button : null;
  };
  const inside = (button: HTMLButtonElement, x: number, y: number) => {
    const r = button.getBoundingClientRect();
    return (
      !button.disabled &&
      x >= r.left &&
      x < r.right &&
      y >= r.top &&
      y < r.bottom
    );
  };
  const start = (button: HTMLButtonElement): Contact => {
    const field = button.dataset.touchField as TouchField;
    const value = field === "axis" ? Number(button.dataset.touchValue) : true;
    const contact = { id: ++nextId, button, field, value };
    input.press(contact.id, field, value, now());
    return contact;
  };
  const move = (contact: Contact, x: number, y: number) => {
    if (contact.field === "axis") {
      // Pointer capture keeps delivering events to the original button. Hit
      // test both arrows so a continuous right-to-left slide really reverses.
      const button = [
        ...root.querySelectorAll<HTMLButtonElement>(
          'button[data-touch-field="axis"]',
        ),
      ].find((candidate) => inside(candidate, x, y));
      if (button) {
        contact.button = button;
        contact.value = Number(button.dataset.touchValue);
        input.press(contact.id, "axis", contact.value, now());
      } else input.cancel(contact.id);
    } else if (!inside(contact.button, x, y)) {
      // Moving off an action releases it; do not trigger a tap or a different
      // action just because the same finger crosses another button.
      input.cancel(contact.id);
    }
  };
  const touch = (event: TouchEvent) => {
    nativeTouch = true;
    let handled = fingers.size > 0;
    // A browser may expose native touch only after the first pointerdown.
    // Retire that fallback contact before accepting the authoritative list.
    for (const [id, contact] of pointers) {
      if (contact.pointerType !== "touch") continue;
      input.cancel(contact.id);
      pointers.delete(id);
      handled = true;
    }
    const live = new Set(
      Array.from(event.touches, (finger) => finger.identifier),
    );
    const ended = new Set(
      Array.from(event.changedTouches, (finger) => finger.identifier),
    );
    const ownsChangedTouch = Array.from(event.changedTouches).some(
      (finger) =>
        fingers.has(finger.identifier) ||
        (event.type === "touchstart" && buttonFrom(finger.target)),
    );
    for (const [id, contact] of fingers) {
      if (live.has(id)) continue;
      if (event.type === "touchend" && ended.has(id))
        input.release(contact.id, now());
      else input.cancel(contact.id);
      fingers.delete(id);
    }
    if (event.type === "touchstart") {
      for (const finger of Array.from(event.changedTouches)) {
        const button = buttonFrom(finger.target);
        if (!button) continue;
        // Touch identifiers are not PointerEvent.pointerId. Keep the two
        // namespaces separate; a new TouchList also removes stale old fingers.
        const previous = fingers.get(finger.identifier);
        if (previous) input.cancel(previous.id);
        fingers.set(finger.identifier, start(button));
        handled = true;
      }
    }
    for (const finger of Array.from(event.touches)) {
      const contact = fingers.get(finger.identifier);
      if (contact) move(contact, finger.clientX, finger.clientY);
    }
    if (handled) {
      if (ownsChangedTouch && event.cancelable) event.preventDefault();
      change();
    }
  };
  const pointerDown = (event: PointerEvent) => {
    if ((event.pointerType === "touch" && nativeTouch) || event.button !== 0)
      return;
    const button = buttonFrom(event.target);
    if (!button) return;
    event.preventDefault();
    const previous = pointers.get(event.pointerId);
    if (previous) input.cancel(previous.id);
    pointers.set(event.pointerId, {
      ...start(button),
      pointerType: event.pointerType,
    });
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The window listeners still observe moves and releases without capture.
    }
    change();
  };
  const pointerMove = (event: PointerEvent) => {
    const contact = pointers.get(event.pointerId);
    if (!contact) return;
    if (event.buttons === 0) {
      input.cancel(contact.id);
      pointers.delete(event.pointerId);
    } else move(contact, event.clientX, event.clientY);
    change();
  };
  const pointerEnd = (event: PointerEvent) => {
    const contact = pointers.get(event.pointerId);
    if (!contact) return;
    if (event.type === "pointerup") input.release(contact.id, now());
    else input.cancel(contact.id);
    pointers.delete(event.pointerId);
    change();
  };
  const clear = () => {
    fingers.clear();
    pointers.clear();
    input.clear();
    change();
  };
  const preventMenu = (event: Event) => event.preventDefault();
  // Capture phase also works if an overlay or a disabled button swallows the
  // bubbling release. Non-passive Touch Events prevent synthetic button clicks.
  const touchOptions = { capture: true, passive: false };
  for (const type of [
    "touchstart",
    "touchmove",
    "touchend",
    "touchcancel",
  ] as const)
    win.addEventListener(type, touch, touchOptions);
  root.addEventListener("pointerdown", pointerDown);
  win.addEventListener("pointermove", pointerMove, true);
  for (const type of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const)
    win.addEventListener(type, pointerEnd, true);
  for (const type of [
    "blur",
    "pagehide",
    "resize",
    "orientationchange",
  ] as const)
    win.addEventListener(type, clear);
  doc.addEventListener("visibilitychange", clear);
  root.addEventListener("contextmenu", preventMenu);
  return () => {
    for (const type of [
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
    ] as const)
      win.removeEventListener(type, touch, true);
    root.removeEventListener("pointerdown", pointerDown);
    win.removeEventListener("pointermove", pointerMove, true);
    for (const type of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const)
      win.removeEventListener(type, pointerEnd, true);
    for (const type of [
      "blur",
      "pagehide",
      "resize",
      "orientationchange",
    ] as const)
      win.removeEventListener(type, clear);
    doc.removeEventListener("visibilitychange", clear);
    root.removeEventListener("contextmenu", preventMenu);
    clear();
  };
}
