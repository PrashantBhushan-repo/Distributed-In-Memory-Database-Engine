import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, GitCompare, Pause, Play, RefreshCw } from 'lucide-react';
import { useMetrics } from '../features/metrics/MetricsContext';
import { MetricSample } from '../features/metrics/types';
import { ChartCard, ChartSeries } from '../features/metrics/ChartCard';
import { mergeMetricHistory, RANGE_MS } from '../features/metrics/history';
import { MonitoringTools } from '../features/metrics/MonitoringTools';
import { formatMetricTime, formatMetricValue as number } from '../features/metrics/format';

type Range = keyof typeof RANGE_MS;
interface MetricChart {
  id: string; title: string; description: string; value: string; unit: string;
  series: ChartSeries[]; map: (point: MetricSample) => Record<string, number | null | undefined>;
  empty?: string;
}

export const MetricsPage: React.FC = () => {
  const { latestSample, stale } = useMetrics();
  const [timeRange, setTimeRange] = useState<Range>('1h');
  const [isPaused, setIsPaused] = useState(false);
  const [comparePrevious, setComparePrevious] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<MetricSample[]>([]);
  const [previousPoints, setPreviousPoints] = useState<MetricSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const changed = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const latest = useRef(latestSample);
  latest.current = latestSample;
  const [thresholds, setThresholds] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('redisx_metrics_thresholds') || '{}');
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) as Record<string, number>;
    } catch { return {}; }
  });
  const saveThreshold = useCallback((id: string, value: number | null) => {
    setThresholds(previous => {
      const next = { ...previous };
      if (value === null) delete next[id]; else next[id] = value;
      localStorage.setItem('redisx_metrics_thresholds', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (isPaused || !pageVisible) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController;
    setLoading(true);
    const load = async () => {
      request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 8000);
      try {
        const response = await fetch(`/api/metrics/history?range=${timeRange}&compare=${comparePrevious}`, { signal: request.signal });
        if (!response.ok) throw new Error('Metric history could not be loaded. Check the gateway and retry.');
        const data = await response.json();
        if (!Array.isArray(data.points)) throw new Error('The gateway returned invalid metric history.');
        if (disposed) return;
        setHistoryPoints(previous => mergeMetricHistory(previous, [...data.points, latest.current], RANGE_MS[timeRange]));
        setPreviousPoints(previous => comparePrevious ? mergeMetricHistory(previous, Array.isArray(data.previousPoints) ? data.previousPoints : [], RANGE_MS[timeRange] * 2) : previous.length ? [] : previous);
        setError('');
      } catch (failure) {
        if (!disposed) setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'Metric history timed out. Retrying automatically.');
      } finally {
        clearTimeout(timeout);
        if (!disposed) { setLoading(false); timer = setTimeout(() => void load(), 5000); }
      }
    };
    void load();
    return () => { disposed = true; clearTimeout(timer); request?.abort(); };
  }, [timeRange, isPaused, comparePrevious, refresh, pageVisible]);

  useEffect(() => {
    if (!isPaused && pageVisible && latestSample.timestamp > 0) setHistoryPoints(previous => mergeMetricHistory(previous, [latestSample], RANGE_MS[timeRange]));
  }, [latestSample, timeRange, isPaused, pageVisible]);

  const displayed = historyPoints[historyPoints.length - 1];
  const charts = useMemo<MetricChart[]>(() => {
    const memoryScale = Math.max(...historyPoints.map(point => point.usedMemory), 0) >= 1048576 ? 1048576 : 1024;
    const memoryUnit = memoryScale === 1048576 ? 'MiB' : 'KiB';
    const percentiles = historyPoints.some(point => point.p99LatencyMs != null);
    const breakdown = ['get', 'set', 'hget', 'zadd', 'other'].filter(key => historyPoints.some(point => point.opsByCommand?.[key] !== undefined));
    return [
      { id: 'ops', title: 'Command throughput', description: breakdown.length ? 'Measured total and reported command rates.' : 'Total commands processed by the engine, including monitoring requests. Per-command rates are not reported.', value: `${number(displayed?.opsPerSec)} ops/s`, unit: 'ops/s',
        series: [{ key: 'total', name: 'Total', color: '#ef4444' }, ...breakdown.map((key, index) => ({ key, name: key.toUpperCase(), color: ['#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#64748b'][index] }))],
        map: point => ({ total: point.opsPerSec, ...Object.fromEntries(breakdown.map(key => [key, point.opsByCommand?.[key] ?? null])) }) },
      { id: 'latency', title: percentiles ? 'Command latency percentiles' : 'Engine response time', description: percentiles ? 'Percentiles reported by the engine.' : 'Measured gateway-to-engine INFO round trip. Command latency percentiles are not reported by this engine.', value: `${number(percentiles ? displayed?.p99LatencyMs ?? undefined : displayed?.infoLatencyMs)} ms`, unit: 'ms',
        series: percentiles ? [{ key: 'p50', name: 'p50', color: '#10b981' }, { key: 'p90', name: 'p90', color: '#f59e0b' }, { key: 'p99', name: 'p99', color: '#ef4444' }] : [{ key: 'roundTrip', name: 'INFO round trip', color: '#f59e0b' }],
        map: point => percentiles ? { p50: point.p50LatencyMs ?? null, p90: point.p90LatencyMs ?? null, p99: point.p99LatencyMs } : { roundTrip: point.infoLatencyMs ?? null }, empty: 'Waiting for a measured engine response time.' },
      { id: 'memory', title: 'Memory consumption', description: displayed?.maxMemory === 0 ? 'Engine-reported allocated memory. No maxmemory limit is configured.' : 'Engine-reported allocated memory and configured limit.', value: `${number(displayed ? displayed.usedMemory / memoryScale : undefined)} ${memoryUnit}`, unit: memoryUnit,
        series: [{ key: 'used', name: 'Used memory', color: '#3b82f6' }, ...(displayed?.maxMemory ? [{ key: 'limit', name: 'Memory limit', color: '#64748b' }] : [])],
        map: point => ({ used: point.usedMemory / memoryScale, limit: point.maxMemory > 0 ? point.maxMemory / memoryScale : null }) },
      { id: 'hitrate', title: 'Cache hit ratio', description: 'Lookup hits divided by lookups. Quiet intervals use the cumulative engine ratio.', value: `${number(displayed?.hitRate)}%`, unit: '%', series: [{ key: 'hitRate', name: 'Hit ratio', color: '#10b981' }], map: point => ({ hitRate: point.hitRate }) },
      { id: 'dynamics', title: 'Evictions and expirations', description: 'Measured changes in the engine expiration and eviction counters.', value: `${number(displayed?.expiredKeysPerSec)} expired/s`, unit: 'keys/s', series: [{ key: 'expired', name: 'Expired', color: '#8b5cf6' }, { key: 'evicted', name: 'Evicted', color: '#ef4444' }], map: point => ({ expired: point.expiredKeysPerSec, evicted: point.evictedKeysPerSec }) },
      { id: 'network', title: displayed?.networkScope === 'gateway' ? 'Studio connection traffic' : 'Network throughput', description: displayed?.networkScope === 'gateway' ? 'Measured socket bytes between Studio and the engine. Other clients are excluded because this engine does not report total network counters.' : 'Rates derived from engine byte counters.', value: displayed?.networkAvailable === false ? 'Unavailable' : `${number(displayed ? displayed.networkOutputBytesPerSec / 1024 : undefined)} KiB/s out`, unit: 'KiB/s', series: [{ key: 'input', name: 'To engine', color: '#06b6d4' }, { key: 'output', name: 'From engine', color: '#3b82f6' }],
        map: point => ({ input: point.networkAvailable ? point.networkInputBytesPerSec / 1024 : null, output: point.networkAvailable ? point.networkOutputBytesPerSec / 1024 : null }), empty: 'This engine build does not expose network byte counters. Network throughput cannot be measured from its INFO response.' },
      { id: 'repl', title: 'Replication offset', description: 'Engine-reported replication position. Offset alone does not measure replica lag.', value: `${number(displayed?.replicationOffsetBytes)} bytes`, unit: 'bytes', series: [{ key: 'offset', name: 'Replication offset', color: '#ec4899' }], map: point => ({ offset: point.replicationOffsetBytes ?? null }), empty: 'The engine does not report a replication offset.' },
    ];
  }, [historyPoints, displayed]);

  const chartViews = useMemo(() => charts.map(chart => ({ ...chart,
    data: historyPoints.map(point => ({ timestamp: point.timestamp, ...chart.map(point) })),
    comparedData: comparePrevious ? previousPoints.map(point => ({ timestamp: point.timestamp + RANGE_MS[timeRange], ...chart.map(point) })) : undefined,
  })), [charts, historyPoints, previousPoints, comparePrevious, timeRange]);

  return <div className="space-y-5" data-testid="metrics-page">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-100"><BarChart2 className="h-5 w-5 text-red-500" />Performance Metrics</h1>
        <p className="mt-1 text-xs text-slate-400">Recorded engine measurements. History is held by the gateway and starts again when it restarts.</p>
        <p className="mt-2 text-xs text-slate-400" role="status" data-testid="metrics-status">{isPaused ? 'Paused' : stale ? 'Waiting for live readings' : 'Live'} · {historyPoints.length} samples{displayed ? ` · Updated ${formatMetricTime(displayed.timestamp)}` : ''}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5" aria-label="Time range">
          {(Object.keys(RANGE_MS) as Range[]).map(range => <button key={range} disabled={isPaused} aria-pressed={timeRange === range} onClick={() => { if (range !== timeRange) { setHistoryPoints([]); setPreviousPoints([]); setTimeRange(range); } }} className={`rounded-md px-2.5 py-1.5 disabled:opacity-50 ${range === timeRange ? 'bg-red-600 text-white' : 'text-slate-400'}`}>{range}</button>)}
        </div>
        <button aria-pressed={comparePrevious} disabled={isPaused} onClick={() => setComparePrevious(value => !value)} className="studio-secondary"><GitCompare size={14} />Compare Previous</button>
        <button aria-label="Refresh metrics" disabled={isPaused || loading} onClick={() => setRefresh(value => value + 1)} className="studio-secondary"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>
        <button onClick={() => setIsPaused(value => !value)} aria-pressed={isPaused} className="studio-secondary">{isPaused ? <Play size={14} /> : <Pause size={14} />}{isPaused ? 'Resume' : 'Pause'}</button>
      </div>
    </div>
    <MonitoringTools />
    {error && <div role="alert" className="studio-form-error">{error} Last verified readings are retained. <button onClick={() => { setIsPaused(false); setRefresh(value => value + 1); }} className="underline">Retry</button></div>}
    {loading && !historyPoints.length && <p role="status">Loading recorded metrics…</p>}
    {comparePrevious && <p className="text-xs text-slate-400" role="status">{previousPoints.length ? `${previousPoints.length} recorded samples from the preceding ${timeRange}, aligned by time. Coverage may be partial.` : `No samples were recorded in the preceding ${timeRange}. Comparison will appear when that history is available.`}</p>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {chartViews.map(chart => <ChartCard key={`${chart.id}-${chart.unit}`} id={chart.id} title={chart.title} description={chart.description} currentValue={chart.value} yUnit={chart.unit}
        data={chart.data}
        comparedData={chart.comparedData}
        isCompareActive={comparePrevious && previousPoints.length > 0} series={chart.series}
        emptyMessage={chart.empty} threshold={thresholds[`${chart.id}:${chart.unit}`]} thresholdKey={`${chart.id}:${chart.unit}`} onSaveThreshold={saveThreshold} isActive={pageVisible} />)}
    </div>
  </div>;
};
