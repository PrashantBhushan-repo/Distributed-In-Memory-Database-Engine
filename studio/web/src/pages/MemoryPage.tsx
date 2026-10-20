import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  RefreshCw,
  Layers,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Database,
} from 'lucide-react';
import { MemoryOverview, TopKey } from '../features/memory/types';
import { MemoryUsageChart } from '../features/memory/MemoryUsageChart';
import { FragmentationCard } from '../features/memory/FragmentationCard';
import { MemoryBreakdownCard } from '../features/memory/MemoryBreakdownCard';
import { TopKeysTable } from '../features/memory/TopKeysTable';
import { PolicySelectorCard } from '../features/memory/PolicySelectorCard';
import { EvictionSimulator } from '../features/memory/EvictionSimulator';
import { EvictionTimeline } from '../features/memory/EvictionTimeline';
import { useEngineAddress } from '../utils/useEngineAddress';

export const MemoryPage: React.FC = () => {
  const engineAddress = useEngineAddress();
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [topKeys, setTopKeys] = useState<TopKey[]>([]);
  const [sampledCount, setSampledCount] = useState(0);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('volatile-lru');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [resMem, resTop] = await Promise.all([
        fetch('/api/memory/overview', { headers }),
        fetch('/api/memory/top-keys?n=20', { headers }),
      ]);

      if (resMem.ok) {
        const dataMem: MemoryOverview = await resMem.json();
        setOverview(dataMem);
        setSelectedPolicy(dataMem.maxmemory_policy);
      }
      if (resTop.ok) {
        const dataTop = await resTop.json();
        setTopKeys(dataTop.top_keys || []);
        setSampledCount(dataTop.sampled_keys || 0);
      }
    } catch (err) {
      console.error('Error fetching memory diagnostics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="flex-1 space-y-5 p-6 bg-[#070b14] text-slate-100 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide">
                Memory &amp; Eviction Manager
              </h1>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-slate-700">
                {engineAddress}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Heap allocations, jemalloc fragmentation, and sample-based eviction forecasting
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-850 hover:text-white transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top Metric Strip */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
              Used Heap Memory
            </span>
            <div className="font-mono text-xl font-bold text-white">
              {formatBytes(overview.used_memory)}
            </div>
            <span className="text-[10px] text-slate-400">
              Peak: {formatBytes(overview.used_memory_peak)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
              Maxmemory Limit
            </span>
            <div className="font-mono text-xl font-bold text-sky-400">
              {overview.maxmemory > 0 ? formatBytes(overview.maxmemory) : 'Unlimited (0)'}
            </div>
            <span className="text-[10px] text-slate-400">
              {overview.maxmemory > 0
                ? `${Math.round((overview.used_memory / overview.maxmemory) * 100)}% capacity utilized`
                : 'No cap configured'}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
              Active Eviction Policy
            </span>
            <div className="font-mono text-sm font-bold text-emerald-400 truncate mt-1">
              {overview.maxmemory_policy}
            </div>
            <span className="text-[10px] text-slate-400">
              Cumulative evictions: {overview.evicted_keys.toLocaleString()}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
              Fragmentation Ratio
            </span>
            <div className="font-mono text-xl font-bold text-white">
              {overview.mem_fragmentation_ratio.toFixed(2)}
            </div>
            <span className="text-[10px] text-emerald-400">
              Allocated vs RSS physical
            </span>
          </div>
        </div>
      )}

      {/* Row 1: Memory Usage Over Time + Fragmentation Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <MemoryUsageChart
            maxMemoryBytes={overview?.maxmemory || 268435456}
            currentUsedBytes={overview?.used_memory || 48500000}
          />
        </div>
        <div>
          <FragmentationCard
            ratio={overview?.mem_fragmentation_ratio || 1.12}
            usedMemoryBytes={overview?.used_memory || 48500000}
          />
        </div>
      </div>

      {/* Row 2: Breakdown by Type/Prefix + Eviction Rate Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MemoryBreakdownCard
          perType={overview?.per_type || []}
          perPrefix={overview?.per_prefix || []}
          estimated={overview?.estimated || false}
          sampledKeys={overview?.sampled_keys || 0}
        />
        <EvictionTimeline totalEvictedKeys={overview?.evicted_keys || 0} />
      </div>

      {/* Row 3: Top 20 Consumers */}
      <TopKeysTable topKeys={topKeys} sampledKeys={sampledCount} />

      {/* Row 4: Policy Selector */}
      <PolicySelectorCard
        currentPolicy={overview?.maxmemory_policy || 'volatile-lru'}
        selectedPolicy={selectedPolicy}
        onSelectPolicy={(p) => setSelectedPolicy(p)}
      />

      {/* Row 5: Eviction Simulator */}
      <EvictionSimulator
        currentMaxmemoryBytes={overview?.maxmemory || 268435456}
        currentPolicy={overview?.maxmemory_policy || 'volatile-lru'}
        selectedPolicy={selectedPolicy}
        onConfigApplied={fetchData}
      />
    </div>
  );
};
