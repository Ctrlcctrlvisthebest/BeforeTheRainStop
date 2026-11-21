import { useState } from "react";
import type { Language } from "./i18n";
import { RainSelect } from "./rain-select";
import { save, stored } from "./storage";
import type { TextSize } from "./text-size";

const KEY = "rain-text-size";

function isTextSize(value: unknown): value is TextSize {
  return value === "standard" || value === "large" || value === "largest";
}

export function useTextSizePreference(compact: boolean) {
  const [value, setValue] = useState<TextSize>(() => {
    const saved = stored<unknown>("local", KEY);
    return isTextSize(saved) ? saved : compact ? "large" : "standard";
  });
  function select(size: TextSize) {
    setValue(size);
    save("local", KEY, size);
  }
  return [value, select] as const;
}

export function TextSizeControls({
  value,
  onChange,
  language,
}: {
  value: TextSize;
  onChange: (size: TextSize) => void;
  language: Language;
}) {
  const english = language === "en";
  return (
    <RainSelect
      className="text-size-control tool-select"
      label={english ? "Text size" : "字号"}
      prefix={english ? "Text size" : "字号"}
      value={value}
      onChange={(next) => {
        if (!isTextSize(next)) throw new Error("Unknown text size");
        onChange(next);
      }}
      options={[
        { value: "standard", label: english ? "Standard" : "标准" },
        { value: "large", label: english ? "Larger" : "较大" },
        { value: "largest", label: english ? "Largest" : "特大" },
      ]}
    />
  );
}
