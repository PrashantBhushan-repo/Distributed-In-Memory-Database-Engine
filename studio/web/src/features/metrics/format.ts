// Locale formatters hold native ICU resources. Reuse them across live updates
// instead of constructing a formatter for every tick on every chart render.
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const value = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
const compact = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3, notation: 'compact' });
const tooltip = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

export const MAX_METRIC_HISTORY_POINTS = 360;
export const MAX_CHART_POINTS = 120;

export function formatMetricTime(timestamp: number): string {
  return Number.isFinite(timestamp) ? clock.format(timestamp) : '—';
}
export function formatMetricValue(number: number | undefined): string {
  return number !== undefined && Number.isFinite(number) ? value.format(number) : '—';
}
export function formatMetricAxis(number: number): string {
  return Number.isFinite(number) ? (Math.abs(number) >= 10000 ? compact : value).format(number) : '—';
}
export function formatMetricTooltip(number: number): string {
  return Number.isFinite(number) ? tooltip.format(number) : '—';
}
