// A geometry update changes replay compatibility and comparable records.
export const CAMPAIGN_VERSION = 6;
// Zero-based chapter indices. Only wind wells (14) and ferry islands (15)
// keep their exact pre-v6 terrain and mechanism layout.
export const UNCHANGED_LEVELS_V6: readonly number[] = [13, 14];
