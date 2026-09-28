import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import type { Language } from "./i18n";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  language: Language;
  needsConfirmation: boolean;
  scopeKey: string;
  onConfirm: () => void;
};

/** Keeps the existing button's layout and touch target. Confirmations are local
 * to one run, expire quickly, and cannot survive leaving the control/page. */
export function SafeRestartButton({
  language,
  needsConfirmation,
  scopeKey,
  onConfirm,
  children,
  disabled,
  onBlur,
  title,
  ...buttonProps
}: Props) {
  const [armed, setArmed] = useState(false);
  const armedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function clear() {
    clearTimeout(timer.current);
    timer.current = undefined;
    armedAt.current = null;
    setArmed(false);
  }
  useEffect(() => {
    clear();
    return () => clearTimeout(timer.current);
  }, [scopeKey, disabled, needsConfirmation]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) clear();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const confirmLabel = language === "zh" ? "再点重开" : "Confirm restart";
  return (
    <button
      {...buttonProps}
      disabled={disabled}
      title={
        armed
          ? language === "zh"
            ? "再次点击会清空本关进度；移开焦点或等待 4 秒取消"
            : "Click again to clear this run. Leave the button or wait 4 seconds to cancel."
          : title
      }
      aria-label={armed ? confirmLabel : buttonProps["aria-label"]}
      aria-live="polite"
      data-restart-confirm={armed ? "true" : undefined}
      onBlur={(event) => {
        clear();
        onBlur?.(event);
      }}
      onClick={() => {
        if (!needsConfirmation) {
          clear();
          onConfirm();
          return;
        }
        const now = performance.now();
        if (armedAt.current !== null && now - armedAt.current < 4000) {
          // A rapid double tap should not turn one accidental touch into consent.
          if (now - armedAt.current < 350) return;
          clear();
          onConfirm();
        } else {
          clear();
          armedAt.current = now;
          setArmed(true);
          timer.current = setTimeout(clear, 4000);
        }
      }}
    >
      {armed ? <span>{confirmLabel}</span> : children}
    </button>
  );
}
