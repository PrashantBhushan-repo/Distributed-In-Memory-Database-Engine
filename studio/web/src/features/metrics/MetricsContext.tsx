import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { MetricSample, HealthSummary } from './types';

interface MetricsContextType {
  latestSample: MetricSample;
  healthSummary: HealthSummary;
  history: MetricSample[];
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  simulateCondition: (condition: string | null) => Promise<void>;
  activeCondition: string | null;
}

const DEFAULT_SAMPLE: MetricSample = {
  timestamp: Date.now(),
  opsPerSec: 0,
  hitRate: 100.0,
  usedMemory: 1048576,
  usedMemoryHuman: '1.00M',
  maxMemory: 268435456,
  memoryPercent: 0.4,
  connectedClients: 1,
  blockedClients: 0,
  totalKeys: 0,
  evictedKeysPerSec: 0,
  expiredKeysPerSec: 0,
  networkInputBytesPerSec: 0,
  networkOutputBytesPerSec: 0,
  p99LatencyMs: 0.25,
};

const DEFAULT_HEALTH: HealthSummary = {
  status: 'healthy',
  thingsToLookAt: [],
  checkedAt: new Date().toISOString(),
};

// Generate realistic initial sparkline data
function generateSeedHistory(): MetricSample[] {
  const now = Date.now();
  const points: MetricSample[] = [];
  for (let i = 60; i >= 0; i--) {
    const t = now - i * 60000;
    points.push({
      timestamp: t,
      opsPerSec: 0,
      hitRate: 100.0,
      usedMemory: 1048576,
      usedMemoryHuman: '1.00M',
      maxMemory: 268435456,
      memoryPercent: 0.4,
      connectedClients: 1,
      blockedClients: 0,
      totalKeys: 0,
      evictedKeysPerSec: 0,
      expiredKeysPerSec: 0,
      networkInputBytesPerSec: 0,
      networkOutputBytesPerSec: 0,
      p99LatencyMs: 0.25,
    });
  }
  return points;
}

const MetricsContext = createContext<MetricsContextType | null>(null);

export const MetricsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [latestSample, setLatestSample] = useState<MetricSample>(DEFAULT_SAMPLE);
  const [healthSummary, setHealthSummary] = useState<HealthSummary>(DEFAULT_HEALTH);
  const [history, setHistory] = useState<MetricSample[]>(generateSeedHistory);
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting' | 'disconnected'>('reconnecting');
  const [activeCondition, setActiveCondition] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch initial history from Gateway REST endpoint
  useEffect(() => {
    fetch('/api/metrics/history?range=1h')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.points) && data.points.length > 0) {
          setHistory(data.points);
          setLatestSample(data.points[data.points.length - 1]);
        }
      })
      .catch(() => {
        // Keep seed history
      });
  }, []);

  // Offline fallback simulation generator when WebSocket is disconnected
  const startFallbackSimulation = useCallback(() => {
    if (fallbackIntervalRef.current) return;
    fallbackIntervalRef.current = setInterval(() => {
      setLatestSample((prev) => {
        const now = Date.now();
        const wave = Math.sin(now / 5000);
        const randomOps = Math.floor(12000 + wave * 3000 + (Math.random() - 0.5) * 800);
        const randomMem = 48500000 + Math.floor(wave * 2500000);
        const randomHit = Math.min(99.9, Math.max(88.0, 96.5 + wave * 2.0));
        const randomClients = Math.floor(42 + Math.abs(wave) * 15);
        const p99 = Math.round((0.85 + Math.abs(wave) * 0.45) * 100) / 100;

        let effectiveMem = randomMem;
        let effectiveHit = Math.round(randomHit * 10) / 10;
        let effectiveEvicted = 0;

        if (activeCondition === 'high_memory') {
          effectiveMem = Math.floor(prev.maxMemory * 0.92);
        } else if (activeCondition === 'low_hit_rate') {
          effectiveHit = 69.2;
        } else if (activeCondition === 'high_eviction') {
          effectiveEvicted = 94;
          effectiveMem = Math.floor(prev.maxMemory * 0.88);
        }

        const memPercent = Math.round((effectiveMem / prev.maxMemory) * 1000) / 10;

        const next: MetricSample = {
          timestamp: now,
          opsPerSec: Math.max(100, randomOps),
          hitRate: effectiveHit,
          usedMemory: effectiveMem,
          usedMemoryHuman: (effectiveMem / (1024 * 1024)).toFixed(2) + 'M',
          maxMemory: prev.maxMemory,
          memoryPercent: memPercent,
          connectedClients: randomClients,
          blockedClients: 2,
          totalKeys: 1850 + Math.floor(wave * 20),
          evictedKeysPerSec: effectiveEvicted,
          expiredKeysPerSec: Math.floor(Math.random() * 4),
          networkInputBytesPerSec: randomOps * 64,
          networkOutputBytesPerSec: randomOps * 128,
          p99LatencyMs: p99,
        };

        // Append to history, keeping max 120 points for smooth charts
        setHistory((hist) => [...hist.slice(-119), next]);
        return next;
      });
    }, 1000);
  }, [activeCondition]);

  const stopFallbackSimulation = useCallback(() => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);

  // WebSocket connection manager with auto-reconnect
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/metrics`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        stopFallbackSimulation();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.sample) {
            setLatestSample(data.sample);
            setHistory((prev) => [...prev.slice(-119), data.sample]);
          }
          if (data?.healthSummary) {
            setHealthSummary(data.healthSummary);
          }
        } catch {
          // ignore corrupted packets
        }
      };

      ws.onclose = () => {
        setConnectionState('reconnecting');
        startFallbackSimulation();
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setConnectionState('reconnecting');
      startFallbackSimulation();
      scheduleReconnect();
    }
  }, [startFallbackSimulation, stopFallbackSimulation]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 8000);
    reconnectAttemptsRef.current += 1;
    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket();
    }, delay);
  }, [connectWebSocket]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
      stopFallbackSimulation();
    };
  }, [connectWebSocket, stopFallbackSimulation]);

  // Simulate condition for demo tweaking
  const simulateCondition = async (condition: string | null) => {
    setActiveCondition(condition);
    try {
      await fetch('/api/health-summary/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition }),
      });
    } catch {
      // Local fallback
    }

    // Local instant health update
    if (!condition) {
      setHealthSummary(DEFAULT_HEALTH);
    } else if (condition === 'high_memory') {
      setHealthSummary({
        status: 'critical',
        topIssue: {
          id: 'high_memory',
          severity: 'critical',
          title: 'Memory usage at 92.4% of limit',
          description: 'Active heap RAM has reached 247.9MB of 256MB maxmemory limit.',
          fixSuggestion: 'Review key memory encodings, configure volatile-lru eviction, or scale up maxmemory in configuration.',
          deepLink: '/memory',
        },
        thingsToLookAt: [
          {
            id: 'high_memory',
            severity: 'critical',
            title: 'Memory usage at 92.4% of limit',
            description: 'Active heap RAM has reached 247.9MB of 256MB maxmemory limit.',
            fixSuggestion: 'Review key memory encodings or scale up maxmemory.',
            deepLink: '/memory',
          },
        ],
        checkedAt: new Date().toISOString(),
      });
    } else if (condition === 'low_hit_rate') {
      setHealthSummary({
        status: 'warning',
        topIssue: {
          id: 'low_hit_rate',
          severity: 'warning',
          title: 'Cache hit rate dropped to 69.2%',
          description: 'A significant proportion of key lookups are returning cache misses, increasing backend load.',
          fixSuggestion: 'Audit key TTL expiration rates and pre-warm high-frequency caches.',
          deepLink: '/keys',
        },
        thingsToLookAt: [
          {
            id: 'low_hit_rate',
            severity: 'warning',
            title: 'Cache hit rate dropped to 69.2%',
            description: '30.8% of queries are missing cache keys.',
            fixSuggestion: 'Review key TTL policies.',
            deepLink: '/keys',
          },
        ],
        checkedAt: new Date().toISOString(),
      });
    } else if (condition === 'high_eviction') {
      setHealthSummary({
        status: 'warning',
        topIssue: {
          id: 'active_evictions',
          severity: 'warning',
          title: 'Active key eviction detected (94 keys/sec)',
          description: 'RedisX is evicting keys to stay below maxmemory bounds.',
          fixSuggestion: 'Review caching policies or enlarge maxmemory to prevent premature data loss.',
          deepLink: '/memory',
        },
        thingsToLookAt: [
          {
            id: 'active_evictions',
            severity: 'warning',
            title: 'Active key eviction detected',
            description: 'Sample-based LRU is dropping keys.',
            fixSuggestion: 'Tune maxmemory limits.',
            deepLink: '/memory',
          },
        ],
        checkedAt: new Date().toISOString(),
      });
    } else if (condition === 'replica_lag') {
      setHealthSummary({
        status: 'warning',
        topIssue: {
          id: 'replica_lag',
          severity: 'warning',
          title: 'Replication lag growing on slave_0',
          description: 'Replica offset difference is exceeding the 1MB replication backlog threshold.',
          fixSuggestion: 'Inspect replica network bandwidth and verify repl-backlog-size capacity.',
          deepLink: '/replication',
        },
        thingsToLookAt: [
          {
            id: 'replica_lag',
            severity: 'warning',
            title: 'Replication lag growing',
            description: 'Replica offset difference > 64KB.',
            fixSuggestion: 'Inspect replication backlog.',
            deepLink: '/replication',
          },
        ],
        checkedAt: new Date().toISOString(),
      });
    }
  };

  return (
    <MetricsContext.Provider
      value={{
        latestSample,
        healthSummary,
        history,
        connectionState,
        simulateCondition,
        activeCondition,
      }}
    >
      {children}
    </MetricsContext.Provider>
  );
};

export const useMetrics = (): MetricsContextType => {
  const context = useContext(MetricsContext);
  if (!context) {
    throw new Error('useMetrics must be used within a MetricsProvider');
  }
  return context;
};
