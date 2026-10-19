import { expect, it, vi } from 'vitest';

it('reuses locale formatters across thousands of live chart ticks', async () => {
  vi.resetModules();
  const date = vi.spyOn(Intl, 'DateTimeFormat');
  const number = vi.spyOn(Intl, 'NumberFormat');
  try {
    const format = await import('../features/metrics/format');
    for (let index = 0; index < 5000; index++) {
      format.formatMetricTime(Date.now() + index);
      format.formatMetricValue(index / 3);
      format.formatMetricAxis(index * 10);
      format.formatMetricTooltip(index / 7);
    }
    expect(date.mock.calls.length).toBeLessThanOrEqual(1);
    expect(number.mock.calls.length).toBeLessThanOrEqual(3);
    expect(format.formatMetricValue(undefined)).toBe('—');
  } finally { vi.restoreAllMocks(); }
});
