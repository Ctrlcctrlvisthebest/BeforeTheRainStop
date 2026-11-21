export const RAIN_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type RainDifficulty = (typeof RAIN_DIFFICULTIES)[number];

export const RAIN_RATE_FACTORS: Readonly<Record<RainDifficulty, number>> = {
  easy: 0.7,
  normal: 1,
  hard: 1.3,
};

export const RAIN_DIFFICULTY_LABELS: Readonly<Record<RainDifficulty, string>> =
  {
    easy: "简单",
    normal: "普通",
    hard: "困难",
  };

export function isRainDifficulty(value: unknown): value is RainDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}
