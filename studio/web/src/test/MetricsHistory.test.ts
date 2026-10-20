import { describe, expect, it } from 'vitest';
import { mergeComparison, mergeMetricHistory } from '../features/metrics/history';
import type { MetricSample } from '../features/metrics/types';
import { MAX_METRIC_HISTORY_POINTS } from '../features/metrics/format';
describe('Metric history and comparison alignment', () => {
  it('retains newer streamed readings when an older history response arrives', () => {
    const point = (timestamp: number) => ({ timestamp } as MetricSample);
    expect(mergeMetricHistory([point(900), point(950)], [point(850), point(900)], 200, 1000).map(p => p.timestamp)).toEqual([850, 900, 950]);
    expect(mergeMetricHistory([point(700), point(1100)], [], 200, 1000)).toEqual([]);
  });
  it('aligns unequal windows by actual timestamps rather than array indices', () => {
    expect(mergeComparison([{ timestamp: 100, ops: 3 }, { timestamp: 300, ops: 9 }], [{ timestamp: 200, ops: 4 }, { timestamp: 300, ops: 5 }], ['ops'])).toEqual([
      { timestamp: 100, ops: 3 }, { timestamp: 200, ops_prev: 4 }, { timestamp: 300, ops: 9, ops_prev: 5 },
    ]);
  });
  it('bounds retained history while preserving the full selected time span', () => {
    const points = Array.from({ length: 10000 }, (_, index) => ({ timestamp: index + 1 } as MetricSample));
    const merged = mergeMetricHistory([], points, 10000, 10000);
    expect(merged).toHaveLength(MAX_METRIC_HISTORY_POINTS);
    expect(merged[0].timestamp).toBe(1);
    expect(merged[merged.length - 1].timestamp).toBe(10000);
  });
  it('reuses unchanged history when the server repeats existing samples', () => {
    const points = [{ timestamp: 1000 } as MetricSample];
    expect(mergeMetricHistory(points, [{ timestamp: 1000 } as MetricSample], 1000, 1000)).toBe(points);
  });
});
