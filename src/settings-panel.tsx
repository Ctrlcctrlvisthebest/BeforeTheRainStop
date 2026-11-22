import {
  useId,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Language } from "./i18n";
import "./settings-panel.css";

export function SettingsPanel({
  open,
  language,
  onClose,
  children,
}: {
  open: boolean;
  language: Language;
  onClose: () => void;
  children: ReactNode;
}) {
  const title = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = panel.current!;
    const doc = element.ownerDocument;
    const previousFocus = doc.activeElement;
    const previousOverflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !element.contains(event.target))
        close.current!.focus();
    };
    doc.addEventListener("focusin", containFocus);
    close.current!.focus({ preventScroll: true });
    return () => {
      doc.removeEventListener("focusin", containFocus);
      doc.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  function containTab(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const controls = [
      ...panel.current!.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (element) =>
        !element.matches(":disabled") &&
        !element.closest('[hidden], [aria-hidden="true"]'),
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = panel.current!.ownerDocument.activeElement;
    if (event.shiftKey ? active === first : active === last) {
      event.preventDefault();
      event.stopPropagation();
      (event.shiftKey ? last : first).focus();
    }
  }

  return (
    <div
      className="settings-scrim"
      hidden={!open}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        id="game-settings"
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        onKeyDownCapture={containTab}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        <div className="settings-heading">
          <h2 id={title}>{language === "zh" ? "设置" : "Settings"}</h2>
          <button
            ref={close}
            type="button"
            className="settings-close"
            aria-label={language === "zh" ? "关闭设置" : "Close settings"}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="settings-content">{children}</div>
      </section>
    </div>
  );
}
