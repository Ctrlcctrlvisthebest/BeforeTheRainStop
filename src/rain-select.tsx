import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import "./rain-select.css";

type Choice = { value: string; label: string; detail?: string };

/** Shared, keyboard-accessible select with a popup styled by the game. */
export function RainSelect({
  value,
  options,
  onChange,
  label,
  prefix,
  className = "",
  title,
}: {
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  label: string;
  prefix?: string;
  className?: string;
  title?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const activeIndex = useRef(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const search = useRef({ text: "", time: 0 });

  function reveal(index: number) {
    activeIndex.current = index;
    setActive(index);
    scrollToOption(index);
  }
  function scrollToOption(index: number) {
    const row = list.current?.children[index] as HTMLElement | undefined;
    const box = list.current;
    if (!row || !box) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (
      row.offsetTop + row.offsetHeight >
      box.scrollTop + box.clientHeight
    )
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }
  function expand() {
    activeIndex.current = selected;
    setActive(selected);
    setOpen(true);
  }
  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const viewport = window.visualViewport;
    const place = () => {
      if (!trigger.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const edge = 12;
      const topEdge = (viewport?.offsetTop ?? 0) + edge;
      const bottomEdge =
        (viewport?.offsetTop ?? 0) +
        (viewport?.height ?? window.innerHeight) -
        edge;
      const below = bottomEdge - rect.bottom - 6;
      const above = rect.top - topEdge - 6;
      const desired = Math.min(360, options.length * 48 + 10);
      const upward = below < desired && above > below;
      const maxHeight = Math.max(48, Math.min(desired, upward ? above : below));
      const width = Math.min(
        Math.max(rect.width, prefix ? 144 : 240),
        window.innerWidth - edge * 2,
      );
      setPosition({
        left: Math.max(
          edge,
          Math.min(rect.left, window.innerWidth - width - edge),
        ),
        top: upward ? rect.top - 6 - maxHeight : rect.bottom + 6,
        width,
        maxHeight,
      });
    };
    place();
    const frame = requestAnimationFrame(() =>
      scrollToOption(activeIndex.current),
    );
    const dismiss = () => setOpen(false);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) dismiss();
    };
    const scroll = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) place();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", dismiss);
    viewport?.addEventListener("resize", dismiss);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", dismiss);
      viewport?.removeEventListener("resize", dismiss);
    };
  }, [open, selected, options.length, prefix]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // These keys belong to the selector, including while the game is running.
    event.stopPropagation();
    const key = event.key;
    if (key === "Tab") {
      setOpen(false);
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else expand();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      event.preventDefault();
      if (!open) expand();
      else
        reveal(
          key === "Home"
            ? 0
            : key === "End"
              ? options.length - 1
              : Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    active + (key === "ArrowDown" ? 1 : -1),
                  ),
                ),
        );
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      search.current = {
        text:
          (now - search.current.time < 700 ? search.current.text : "") +
          key.toLowerCase(),
        time: now,
      };
      const index = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(search.current.text),
      );
      if (index >= 0) {
        if (!open) setOpen(true);
        reveal(index);
      }
    }
  }

  return (
    <div ref={root} className={`rain-select ${className}`}>
      <button
        ref={trigger}
        type="button"
        className="rain-select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        title={title}
        onClick={() => (open ? setOpen(false) : expand())}
        onKeyDown={keyDown}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        {prefix && <span className="rain-select-prefix">{prefix}</span>}
        <span className="rain-select-value">{options[selected]?.label}</span>
        {options[selected]?.detail && (
          <span className="rain-select-detail">{options[selected].detail}</span>
        )}
        <span className="rain-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="rain-select-list"
          style={position}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`rain-select-option${index === active ? " is-active" : ""}`}
              onPointerMove={() => {
                activeIndex.current = index;
                setActive(index);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span className="rain-select-check" aria-hidden="true">
                {option.value === value ? "✓" : ""}
              </span>
              <span className="rain-select-value">{option.label}</span>
              {option.detail && (
                <span className="rain-select-detail">{option.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
