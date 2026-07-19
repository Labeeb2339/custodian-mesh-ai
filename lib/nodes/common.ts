import type { AggregateRow, MetricKey } from "../types";

export const MIN_CELL_SIZE = 5;

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function publishedRow(
  region: string,
  recordsAggregated: number,
  requestedMetrics: MetricKey[],
  computedValues: Partial<Record<MetricKey, number>>,
): AggregateRow {
  if (recordsAggregated < MIN_CELL_SIZE) {
    return {
      region,
      values: Object.fromEntries(
        requestedMetrics.map((metric) => [metric, null]),
      ) as Partial<Record<MetricKey, null>>,
      cellSizeBand: "<5",
      recordsAggregated: null,
      suppressed: true,
    };
  }

  return {
    region,
    values: Object.fromEntries(
      requestedMetrics.map((metric) => [metric, computedValues[metric] ?? null]),
    ) as Partial<Record<MetricKey, number | null>>,
    cellSizeBand: "5+",
    recordsAggregated,
    suppressed: false,
  };
}
