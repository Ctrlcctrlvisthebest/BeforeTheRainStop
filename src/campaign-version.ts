// A geometry update changes replay compatibility and comparable records.
export const CAMPAIGN_VERSION = 8;
// Zero-based chapter indices. Only wind wells (14) and ferry islands (15)
// keep their exact pre-v6 terrain and mechanism layout.
export const UNCHANGED_LEVELS_V6: readonly number[] = [13, 14];

// The v7 expansion adds chapters 28–40 without changing any v6 chapter.
export const V6_CAMPAIGN_LENGTH = 27;

// v8 remakes seven late chapters. Other v7 terrain and records remain comparable.
export const REBUILT_LEVELS_V8: readonly number[] = [
  28, 29, 31, 33, 34, 35, 39,
];
