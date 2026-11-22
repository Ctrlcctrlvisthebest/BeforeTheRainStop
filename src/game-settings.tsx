import type { ComponentProps } from "react";
import { SettingsPanel } from "./settings-panel";
import { MusicControls, EffectsControls } from "./audio";
import { QualityControls } from "./quality-controls";
import { TextSizeControls } from "./text-size-controls";
import { RainDifficultyControls } from "./rain-controls";
import { translate, type Language } from "./i18n";
import type { QualityMode } from "./render-quality";
import type { TextSize } from "./text-size";
import type { RainDifficulty } from "./rain-difficulty";

type Props = {
  open: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  audio: ComponentProps<typeof MusicControls>["audio"];
  quality: QualityMode;
  onQualityChange: (quality: QualityMode) => void;
  textSize: TextSize;
  onTextSizeChange: (size: TextSize) => void;
  weatherRanges: boolean;
  onWeatherRangesChange: (enabled: boolean) => void;
  rainDifficulty: RainDifficulty;
  onRainDifficultyChange: (difficulty: RainDifficulty) => void;
  rainLocked: boolean;
  guideEnabled: boolean;
  onGuideChange: (enabled: boolean) => void;
  onHelp: () => void;
};

export function GameSettings({
  open,
  onClose,
  language,
  onLanguageChange,
  audio,
  quality,
  onQualityChange,
  textSize,
  onTextSizeChange,
  weatherRanges,
  onWeatherRangesChange,
  rainDifficulty,
  onRainDifficultyChange,
  rainLocked,
  guideEnabled,
  onGuideChange,
  onHelp,
}: Props) {
  const t = (text: string) => translate(language, text);
  return (
    <SettingsPanel open={open} language={language} onClose={onClose}>
      <section className="settings-section">
        <h3>{t("声音")}</h3>
        <div className="settings-row">
          <MusicControls audio={audio} language={language} />
        </div>
        <div className="settings-row">
          <EffectsControls audio={audio} language={language} />
        </div>
      </section>
      <section className="settings-section">
        <h3>{t("画面与阅读")}</h3>
        <div className="settings-row">
          <QualityControls
            value={quality}
            onChange={onQualityChange}
            language={language}
          />
        </div>
        <div className="settings-row">
          <TextSizeControls
            value={textSize}
            onChange={onTextSizeChange}
            language={language}
          />
        </div>
        <div className="settings-row">
          <span>{t("雨风范围提示")}</span>
          <button
            type="button"
            role="switch"
            aria-label={t("雨风范围提示")}
            aria-checked={weatherRanges}
            onClick={() => onWeatherRangesChange(!weatherRanges)}
          >
            {t(weatherRanges ? "开启" : "关闭")}
          </button>
        </div>
        <p className="settings-note">{t("用半透明色块标出雨区与风区。")}</p>
        <div className="settings-row">
          <span>{t("语言")}</span>
          <button
            className="language"
            aria-label={t("切换语言")}
            onClick={() => onLanguageChange(language === "zh" ? "en" : "zh")}
          >
            中文 / EN
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h3>{t("玩法与引导")}</h3>
        <div className="settings-row">
          <RainDifficultyControls
            value={rainDifficulty}
            onChange={onRainDifficultyChange}
            language={language}
            disabled={rainLocked}
            title={t(
              "简单 70% · 普通 100% · 困难 130%。联机由房主在出发前选择。",
            )}
          />
        </div>
        <p className="settings-note">
          {t("雨速在出发前选择，联机由房主设置。")}
        </p>
        <div className="settings-row">
          <span>{t("玩法引导")}</span>
          <button
            aria-label={t("切换玩法引导")}
            aria-pressed={guideEnabled}
            onClick={() => onGuideChange(!guideEnabled)}
          >
            {t(guideEnabled ? "引导开" : "引导关")}
          </button>
        </div>
        <div className="settings-row">
          <button onClick={onHelp}>{t("操作说明")}</button>
        </div>
      </section>
    </SettingsPanel>
  );
}
