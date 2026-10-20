import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { Download, Bell, BellRing, Check, X } from 'lucide-react';
import { downsampleLTTB, exportChartToCsv } from './lttb';
import { mergeComparison } from './history';
import { formatMetricAxis, formatMetricTime, formatMetricTooltip, MAX_CHART_POINTS } from './format';

const CHART_MARGIN = { top: 10, right: 15, left: 0, bottom: 0 };
const AUTO_DOMAIN: ['auto', 'auto'] = ['auto', 'auto'];
const TIME_DOMAIN: ['dataMin', 'dataMax'] = ['dataMin', 'dataMax'];
const PERCENT_DOMAIN: [number, number] = [0, 100];
const TOOLTIP_STYLE = { backgroundColor: '#0f172a', borderColor: '#475569', borderRadius: 8, color: '#f8fafc', fontSize: 12 };
const EMPTY_POINTS: Record<string, any>[] = [];

export interface ChartSeries { key: string; name: string; color: string; unit?: string; dashed?: boolean; }
interface ChartCardProps {
  id: string; title: string; description?: string; currentValue: string;
  data: Record<string, any>[]; comparedData?: Record<string, any>[]; series: ChartSeries[];
  yUnit?: string; threshold?: number; onSaveThreshold?: (id: string, value: number | null) => void;
  isCompareActive?: boolean; emptyMessage?: string;
  thresholdKey?: string; isActive?: boolean;
}
const ChartCardComponent: React.FC<ChartCardProps> = ({ id, title, description, currentValue, data, comparedData = EMPTY_POINTS, series, yUnit = '', threshold, onSaveThreshold, isCompareActive = false, emptyMessage, thresholdKey = id, isActive = true }) => {
  const [showThreshold, setShowThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const plot = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasData = data.some(point => series.some(item => typeof point[item.key] === 'number' && Number.isFinite(point[item.key])));
  const firstKey = series[0]?.key;
  let current: number | undefined;
  for (let index = data.length - 1; index >= 0; index--) { if (typeof data[index][firstKey] === 'number') { current = data[index][firstKey]; break; } }
  useEffect(() => {
    if (!hasData || !plot.current) return;
    if (typeof IntersectionObserver === 'undefined') { setIsVisible(true); return; }
    const observer = new IntersectionObserver(entries => setIsVisible(entries[0]?.isIntersecting ?? false), { rootMargin: '80px' });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, [hasData]);
  const renderPlot = isActive && isVisible;
  const breached = hasData && threshold !== undefined && current !== undefined && (id === 'hitrate' ? current < threshold : current > threshold);
  const mergedData = useMemo(() => {
    if (!renderPlot) return EMPTY_POINTS;
    const reduce = (points: Record<string, any>[]) => downsampleLTTB(points, MAX_CHART_POINTS, point => point.timestamp, point => point[firstKey] ?? 0);
    return isCompareActive ? mergeComparison(reduce(data), reduce(comparedData), series.map(item => item.key)) : reduce(data);
  }, [data, comparedData, series, firstKey, isCompareActive, renderPlot]);
  const exportCsv = () => exportChartToCsv(`redis-${id}-${new Date().toISOString().slice(0, 10)}`, data,
    [{ key: 'timestamp', header: 'Timestamp (UTC)' }, ...series.map(item => ({ key: item.key, header: `${item.name} (${item.unit || yUnit})` }))]);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(thresholdInput);
    if (thresholdInput.trim() && Number.isFinite(value) && value >= 0) { onSaveThreshold?.(thresholdKey, value); setShowThreshold(false); }
  };
  return <section aria-labelledby={`metric-${id}`} data-testid={`metric-${id}`} className="relative flex min-w-0 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h2 id={`metric-${id}`} className="text-sm font-semibold text-slate-100">{title}</h2>{description && <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="metric-value" className="font-mono text-base font-bold text-slate-100">{currentValue}</span>
        <button aria-label={`Set threshold for ${title}`} title="Set a local chart threshold" disabled={!hasData} onClick={() => { setThresholdInput(threshold === undefined ? '' : String(threshold)); setShowThreshold(value => !value); }} className="studio-icon-button disabled:opacity-40">{threshold === undefined ? <Bell size={15} /> : <BellRing size={15} />}</button>
        <button aria-label={`Download ${title} CSV`} title="Download CSV" disabled={!hasData} onClick={exportCsv} className="studio-icon-button disabled:opacity-40"><Download size={15} /></button>
      </div>
    </div>
    {threshold !== undefined && <p className={`mt-2 text-xs ${breached ? 'text-amber-400' : 'text-slate-400'}`} role="status">{breached ? 'Threshold crossed' : 'Threshold'}: {id === 'hitrate' ? 'below' : 'above'} {threshold} {yUnit}</p>}
    {showThreshold && <div role="dialog" aria-label={`Threshold for ${title}`} className="mt-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">Local chart threshold</span><button aria-label="Close threshold settings" onClick={() => setShowThreshold(false)}><X size={15} /></button></div>
      <p className="my-2 text-xs text-slate-400">Highlights when the first series goes {id === 'hitrate' ? 'below' : 'above'} this value. Saved in this browser; notifications are not sent.</p>
      <form onSubmit={save} className="flex flex-wrap items-center gap-2">
        <label className="text-xs">Threshold ({yUnit})<input aria-label={`Threshold (${yUnit})`} type="number" required min="0" step="any" value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} className="ml-2 w-28 rounded border border-slate-600 bg-slate-900 px-2 py-1" autoFocus /></label>
        <button type="submit" className="studio-secondary"><Check size={14} />Save</button>
        {threshold !== undefined && <button type="button" className="studio-secondary" onClick={() => { onSaveThreshold?.(thresholdKey, null); setShowThreshold(false); }}>Clear threshold</button>}
      </form>
    </div>}
    {hasData ? <div ref={plot} className="mt-3 h-48 min-w-0 w-full" aria-label={`${title} chart`}>
      {renderPlot && <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={mergedData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="timestamp" type="number" scale="time" domain={TIME_DOMAIN} stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={formatMetricTime} minTickGap={30} />
          <YAxis width={55} stroke="#94a3b8" fontSize={10} tickLine={false} domain={id === 'hitrate' ? PERCENT_DOMAIN : AUTO_DOMAIN} tickFormatter={formatMetricAxis} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={value => formatMetricTime(Number(value))} formatter={(value: any, name: any) => [`${formatMetricTooltip(Number(value))} ${yUnit}`, String(name)]} />
          {threshold !== undefined && <ReferenceLine y={threshold} ifOverflow="extendDomain" stroke="#f59e0b" strokeDasharray="4 4" />}
          {isCompareActive && series.map(item => <Line key={`${item.key}-previous`} dataKey={`${item.key}_prev`} name={`${item.name} (previous)`} stroke={item.color} strokeDasharray="4 4" strokeOpacity={0.5} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />)}
          {series.map(item => <Line key={item.key} dataKey={item.key} name={item.name} stroke={item.color} strokeWidth={2} dot={data.length < 3 ? { r: 3 } : false} connectNulls={isCompareActive} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>}
    </div> : <div className="mt-3 flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-700 px-5 text-center text-sm text-slate-400" role="status">{data.length ? emptyMessage || 'This measurement is not reported by the connected engine.' : 'Waiting for recorded samples. Keep the engine and gateway running.'}</div>}
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">{hasData && series.map(item => <span key={item.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>)}{isCompareActive && hasData && <span>Dashed: previous period</span>}</div>
  </section>;
};

export const ChartCard = React.memo(ChartCardComponent);
