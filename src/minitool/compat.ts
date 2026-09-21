/** Only loaded by the classic-script offline build, before the game modules. */
const root = window as Window & typeof globalThis;
if (typeof globalThis === "undefined")
  Object.defineProperty(window, "globalThis", {
    value: window,
    configurable: true,
  });

// Game snapshots contain plain objects/arrays, including non-finite numbers.
// JSON round-trips would silently turn Infinity into null.
export function cloneSnapshot<T>(
  value: T,
  seen = new Map<object, unknown>(),
): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value) as T;
  const copy: Record<string, unknown> | unknown[] = Array.isArray(value)
    ? []
    : {};
  seen.set(value, copy);
  for (const key of Object.keys(value))
    (copy as Record<string, unknown>)[key] = cloneSnapshot(
      (value as Record<string, unknown>)[key],
      seen,
    );
  return copy as T;
}
if (!root.structuredClone)
  root.structuredClone = (value) => cloneSnapshot(value);
if (!Object.hasOwn)
  Object.defineProperty(Object, "hasOwn", {
    value: (object: object, key: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(object, key),
    configurable: true,
    writable: true,
  });
if (!Object.fromEntries)
  Object.defineProperty(Object, "fromEntries", {
    value(entries: Iterable<[PropertyKey, unknown]>) {
      const object = {};
      for (const [key, value] of entries)
        Object.defineProperty(object, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      return object;
    },
    configurable: true,
    writable: true,
  });
if (!Array.prototype.flatMap)
  Object.defineProperty(Array.prototype, "flatMap", {
    value(
      this: unknown[],
      callback: (value: unknown, i: number, array: unknown[]) => unknown,
      thisArg?: unknown,
    ) {
      const result: unknown[] = [];
      this.forEach((value, i) => {
        const mapped = callback.call(thisArg, value, i, this);
        if (Array.isArray(mapped)) mapped.forEach((item) => result.push(item));
        else result.push(mapped);
      });
      return result;
    },
    configurable: true,
    writable: true,
  });
if (!Array.prototype.at)
  Object.defineProperty(Array.prototype, "at", {
    value(this: unknown[], index: number) {
      const i = Math.trunc(index) || 0;
      return this[i < 0 ? this.length + i : i];
    },
    configurable: true,
    writable: true,
  });
if (!root.crypto.randomUUID)
  root.crypto.randomUUID = () => {
    const bytes = new Uint8Array(16);
    root.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  };
const nativeMatchMedia = window.matchMedia.bind(window);
window.matchMedia = (query) => {
  const media = nativeMatchMedia(query);
  if (!media.addEventListener) {
    media.addEventListener = ((
      _type: string,
      listener: Parameters<MediaQueryList["addListener"]>[0],
    ) => media.addListener(listener)) as MediaQueryList["addEventListener"];
    media.removeEventListener = ((
      _type: string,
      listener: Parameters<MediaQueryList["removeListener"]>[0],
    ) =>
      media.removeListener(listener)) as MediaQueryList["removeEventListener"];
  }
  return media;
};

// ResizeObserver was added after Chrome 61. Observe layout-affecting DOM changes
// and the viewport, coalescing measurements and never polling in the background.
if (!root.ResizeObserver) {
  class LayoutObserver {
    private sizes = new Map<Element, { width: number; height: number }>();
    private frame = 0;
    private mutation = new MutationObserver(() => this.schedule());
    constructor(private callback: ResizeObserverCallback) {}
    private schedule = () => {
      if (this.frame || document.hidden || !this.sizes.size) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        const entries: ResizeObserverEntry[] = [];
        for (const [target, previous] of this.sizes) {
          const rect = target.getBoundingClientRect();
          if (
            rect.width !== previous.width ||
            rect.height !== previous.height
          ) {
            this.sizes.set(target, { width: rect.width, height: rect.height });
            entries.push({ target, contentRect: rect } as ResizeObserverEntry);
          }
        }
        if (entries.length)
          this.callback(entries, this as unknown as ResizeObserver);
      });
    };
    observe(target: Element) {
      this.sizes.set(target, { width: -1, height: -1 });
      this.mutation.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      window.addEventListener("resize", this.schedule);
      document.addEventListener("visibilitychange", this.schedule);
      this.schedule();
    }
    unobserve(target: Element) {
      this.sizes.delete(target);
      if (!this.sizes.size) this.disconnect();
    }
    disconnect() {
      this.sizes.clear();
      this.mutation.disconnect();
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      window.removeEventListener("resize", this.schedule);
      document.removeEventListener("visibilitychange", this.schedule);
    }
  }
  root.ResizeObserver = LayoutObserver as unknown as typeof ResizeObserver;
}

const updateHeight = () =>
  document.documentElement.style.setProperty(
    "--app-height",
    `${window.innerHeight}px`,
  );
window.addEventListener("resize", updateHeight);
updateHeight();
const flex = document.createElement("div");
flex.style.cssText =
  "position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px";
flex.appendChild(document.createElement("div"));
flex.appendChild(document.createElement("div"));
document.body.appendChild(flex);
document.documentElement.classList.toggle(
  "no-flex-gap",
  flex.scrollHeight !== 1,
);
flex.remove();
