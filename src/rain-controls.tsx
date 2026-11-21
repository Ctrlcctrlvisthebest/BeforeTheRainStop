import { useState } from "react";
import { translate, type Language } from "./i18n";
import {
  isRainDifficulty,
  RAIN_DIFFICULTIES,
  RAIN_DIFFICULTY_LABELS,
  type RainDifficulty,
} from "./rain-difficulty";
import { RainSelect } from "./rain-select";
import { save, stored } from "./storage";

const KEY = "rain-difficulty";

export function useRainDifficultyPreference() {
  const [value, setValue] = useState<RainDifficulty>(() => {
    const saved = stored<unknown>("local", KEY);
    return isRainDifficulty(saved) ? saved : "normal";
  });
  function select(difficulty: RainDifficulty) {
    setValue(difficulty);
    save("local", KEY, difficulty);
  }
  return [value, select] as const;
}

export function RainDifficultyControls({
  value,
  onChange,
  language,
  disabled = false,
  title,
}: {
  value: RainDifficulty;
  onChange: (difficulty: RainDifficulty) => void;
  language: Language;
  disabled?: boolean;
  title?: string;
}) {
  const label = translate(language, "雨速");
  return (
    <fieldset className="rain-control-field" disabled={disabled} title={title}>
      <RainSelect
        key={disabled ? "locked" : "editable"}
        className="rain-control tool-select"
        label={label}
        prefix={label}
        value={value}
        onChange={(next) => {
          if (!isRainDifficulty(next))
            throw new Error("Unknown rain difficulty");
          onChange(next);
        }}
        options={RAIN_DIFFICULTIES.map((difficulty) => ({
          value: difficulty,
          label: translate(language, RAIN_DIFFICULTY_LABELS[difficulty]),
        }))}
      />
    </fieldset>
  );
}
