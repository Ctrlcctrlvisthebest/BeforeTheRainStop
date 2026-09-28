/** CPU submission time is not GPU execution time. Keep tail latency visible. */
export function summarize(values: readonly number[]) {
  const sorted = values
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b);
  const round = (value: number) => Math.round(value * 100) / 100;
  const percentile = (fraction: number) =>
    round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0);
  return {
    samples: sorted.length,
    mean: round(sorted.reduce((sum, n) => sum + n, 0) / (sorted.length || 1)),
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: round(sorted.at(-1) ?? 0),
    over25ms: sorted.filter((n) => n > 25).length,
    over50ms: sorted.filter((n) => n > 50).length,
  };
}

export const RENDER_CASES = [
  [1, 0] as const,
  [6, 10] as const,
  [6, 11] as const,
  ...Array.from({ length: 13 }, (_, i) => [
    [1, i + 27] as const,
    [6, i + 27] as const,
  ]).flat(),
];
