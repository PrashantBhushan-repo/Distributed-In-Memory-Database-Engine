import React, { createContext, useContext, useState, useEffect } from 'react';
import { MetricSample, HealthSummary } from './types';
import { websocketUrl } from '../../utils/api';
import { mergeMetricHistory, RANGE_MS } from './history';

export interface EngineStatus {
  status: 'connected' | 'connecting' | 'error' | 'demo';
  host: string; port: number; isDemo: boolean; capabilities: string[]; error?: string;
  capabilitiesState?: 'pending' | 'ready' | 'error';
  tlsEnabled?: boolean;
}
interface MetricsContextType {
  latestSample: MetricSample; healthSummary: HealthSummary; history: MetricSample[];
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  engine: EngineStatus | null; hasSample: boolean; stale: boolean;
  simulateCondition: (condition: string | null) => Promise<void>; activeCondition: string | null;
}
const EMPTY_SAMPLE: MetricSample = {
  timestamp: 0, opsPerSec: 0, hitRate: 0, usedMemory: 0, usedMemoryHuman: '—', maxMemory: 0,
  memoryPercent: 0, connectedClients: 0, blockedClients: 0, totalKeys: 0, evictedKeysPerSec: 0,
  expiredKeysPerSec: 0, networkInputBytesPerSec: 0, networkOutputBytesPerSec: 0, p99LatencyMs: null,
};
const WAITING_HEALTH: HealthSummary = { status: 'warning', thingsToLookAt: [], checkedAt: new Date(0).toISOString() };
const MetricsContext = createContext<MetricsContextType | null>(null);

export const MetricsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [latestSample, setLatestSample] = useState(EMPTY_SAMPLE);
  const [healthSummary, setHealthSummary] = useState(WAITING_HEALTH);
  const [history, setHistory] = useState<MetricSample[]>([]);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [stale, setStale] = useState(true);
  const [connectionState, setConnectionState] = useState<MetricsContextType['connectionState']>('reconnecting');
  const [activeCondition, setActiveCondition] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let lastReceived = 0;
    const abort = new AbortController();
    fetch('/api/metrics/history?range=1h', { signal: abort.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!disposed && Array.isArray(data.points)) {
        setHistory(previous => mergeMetricHistory(previous, data.points, RANGE_MS['1h']));
        const latest = data.points[data.points.length - 1];
        if (latest) setLatestSample(previous => latest.timestamp > previous.timestamp ? latest : previous);
      }
    }).catch(() => {});
    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(websocketUrl('/ws/metrics'));
      ws.onmessage = event => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data);
          if (!data.status || !data.sample || typeof data.sample.timestamp !== 'number') return;
          lastReceived = Date.now(); attempts = 0;
          setEngine(data.status);
          const fresh = !data.stale && ['connected', 'demo'].includes(data.status.status) && Date.now() - data.sample.timestamp < 5000;
          setStale(!fresh); setConnectionState('connected');
          if (data.sample.timestamp > 0) {
            setLatestSample(previous => data.sample.timestamp > previous.timestamp ? data.sample : previous);
            if (fresh) setHistory(previous => mergeMetricHistory(previous, [data.sample], RANGE_MS['1h']));
          }
          if (data.healthSummary) setHealthSummary(data.healthSummary);
        } catch { /* Keep the last verified reading. */ }
      };
      ws.onclose = () => {
        if (disposed) return;
        setStale(true); setConnectionState('reconnecting');
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    const watchdog = setInterval(() => { if (Date.now() - lastReceived > 5000) setStale(true); }, 2000);
    return () => { disposed = true; abort.abort(); clearTimeout(timer); clearInterval(watchdog); ws?.close(); };
  }, []);

  const simulateCondition = async (condition: string | null) => {
    const response = await fetch('/api/health-summary/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ condition }) });
    if (!response.ok) throw new Error('Simulation is available only for administrators using demo mode.');
    setActiveCondition(condition);
  };
  return <MetricsContext.Provider value={{ latestSample, healthSummary, history, engine, stale,
    hasSample: latestSample.timestamp > 0, connectionState, simulateCondition, activeCondition }}>{children}</MetricsContext.Provider>;
};
export function useMetrics() {
  const context = useContext(MetricsContext);
  if (!context) throw new Error('useMetrics requires MetricsProvider');
  return context;
}
