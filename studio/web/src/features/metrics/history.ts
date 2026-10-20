import type { MetricSample, TimeRangeOption } from './types';
import { MAX_METRIC_HISTORY_POINTS } from './format';

export const RANGE_MS: Record<Exclude<TimeRangeOption, 'custom'>, number> = {
  '15m': 15 * 60_000, '1h': 60 * 60_000, '6h': 6 * 60 * 60_000, '24h': 24 * 60 * 60_000,
};

export function mergeMetricHistory(existing: MetricSample[], incoming: MetricSample[], windowMs: number, now = Date.now()): MetricSample[] {
  const points = new Map<number, MetricSample>();
  for (const source of [existing, incoming]) for (const point of source) {
    if (point && Number.isFinite(point.timestamp) && point.timestamp > 0 && point.timestamp >= now - windowMs && point.timestamp <= now && !points.has(point.timestamp)) points.set(point.timestamp, point);
  }
  const sorted = [...points.values()].sort((a, b) => a.timestamp - b.timestamp);
  const bounded = sorted.length <= MAX_METRIC_HISTORY_POINTS ? sorted : Array.from({ length: MAX_METRIC_HISTORY_POINTS }, (_, index) => sorted[Math.floor(index * (sorted.length - 1) / (MAX_METRIC_HISTORY_POINTS - 1))]);
  return bounded.length === existing.length && bounded.every((point, index) => point === existing[index]) ? existing : bounded;
}

export function mergeComparison(current: Record<string, any>[], previous: Record<string, any>[], keys: string[]) {
  const rows = new Map<number, Record<string, any>>(current.map(point => [point.timestamp, { ...point }]));
  for (const point of previous) {
    const row = rows.get(point.timestamp) ?? { timestamp: point.timestamp };
    for (const key of keys) row[`${key}_prev`] = point[key];
    rows.set(point.timestamp, row);
  }
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
}
