import { useState } from "react";
import type { Language } from "./i18n";
import { qualityMode, type QualityMode } from "./render-quality";
import { save, stored } from "./storage";
import { RainSelect } from "./rain-select";
import "./quality-controls.css";

const KEY = "rain-render-quality";
export function useQualityPreference() {
  const [value, setValue] = useState<QualityMode>(() =>
    qualityMode(stored("local", KEY)),
  );
  function select(mode: QualityMode) {
    const next = qualityMode(mode);
    setValue(next);
    save("local", KEY, next);
  }
  return [value, select] as const;
}

export function QualityControls({
  value,
  onChange,
  language,
}: {
  value: QualityMode;
  onChange: (mode: QualityMode) => void;
  language: Language;
}) {
  const english = language === "en";
  return (
    <RainSelect
      className="quality-control"
      label={english ? "Graphics" : "画质"}
      prefix={english ? "Graphics" : "画质"}
      value={value}
      onChange={(next) => onChange(qualityMode(next))}
      options={[
        { value: "auto", label: english ? "Auto" : "自动" },
        { value: "standard", label: english ? "Standard" : "标准" },
        { value: "economy", label: english ? "Power saving" : "省电" },
      ]}
      title={
        english
          ? "Auto reduces rendering detail after sustained slow frames. Gameplay stays the same."
          : "自动模式会在持续卡顿后降低渲染开销，不改变玩法。"
      }
    />
  );
}
