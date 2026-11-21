export type TextSize = "standard" | "large" | "largest";

export const TEXT_SIZE_FACTORS: Readonly<Record<TextSize, number>> = {
  standard: 1,
  large: 1.2,
  largest: 1.4,
};
