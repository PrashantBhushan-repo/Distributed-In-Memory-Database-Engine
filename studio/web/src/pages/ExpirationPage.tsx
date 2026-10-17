import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  RefreshCw,
  Plus,
  Timer,
  BarChart3,
  Activity,
  Layers,
} from 'lucide-react';
import {
  ExpiringKey,
  HistogramBucket,
  ExpirationStats,
} from '../features/expiration/types';
import { SoonestExpiringList } from '../features/expiration/SoonestExpiringList';
import { TtlHistogramChart } from '../features/expiration/TtlHistogramChart';
import { ExpiredVsEvictedChart } from '../features/expiration/ExpiredVsEvictedChart';
import { ActiveExpireStatsCard } from '../features/expiration/ActiveExpireStatsCard';
import { BulkSetTtlModal } from '../features/expiration/BulkSetTtlModal';
import { getDisplayHost } from '../utils/host';

export const ExpirationPage: React.FC = () => {
  const [keys, setKeys] = useState<ExpiringKey[]>([]);
  const [totalWithTtl, setTotalWithTtl] = useState(0);
  const [totalSampled, setTotalSampled] = useState(0);
  const [buckets, setBuckets] = useState<HistogramBucket[]>([]);
  const [stats, setStats] = useState<ExpirationStats | null>(null);

  const [bulkSetOpen, setBulkSetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [resSoon, resHist, resStats] = await Promise.all([
        fetch('/api/expiration/soonest?n=50', { headers }),
        fetch('/api/expiration/histogram', { headers }),
        fetch('/api/expiration/stats', { headers }),
      ]);

      if (resSoon.ok) {
        const dSoon = await resSoon.json();
        setKeys(dSoon.keys || []);
        setTotalWithTtl(dSoon.totalWithTtl || 0);
        setTotalSampled(dSoon.totalSampled || 0);
      }
      if (resHist.ok) {
        const dHist = await resHist.json();
        setBuckets(dHist.buckets || []);
      }
      if (resStats.ok) {
        const dStats = await resStats.json();
        setStats(dStats);
      }
    } catch (err) {
      console.error('Error fetching expiration telemetry:', err);
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

  return (
    <div className="flex-1 space-y-5 p-6 bg-[#070b14] text-slate-100 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide">
                Key Expiration &amp; TTL Lifecycle
              </h1>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-slate-700">
                {getDisplayHost()}[db0]
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live expiration countdowns, TTL histogram distribution, and adaptive 10Hz purge cycles
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setBulkSetOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Bulk Set TTL</span>
          </button>

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

      {/* Row 1: Active Expiration Status Cards */}
      <ActiveExpireStatsCard
        expiredKeys={stats?.expired_keys || 0}
        expiredRate={stats?.expired_rate || 0}
        activeExpireEnabled={stats?.active_expire_enabled ?? true}
      />

      {/* Row 2: Expired vs. Evicted Rates & TTL Histogram */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ExpiredVsEvictedChart
          timeline={stats?.timeline || []}
          expiredRate={stats?.expired_rate || 0}
          evictedRate={stats?.evicted_rate || 0}
        />
        <TtlHistogramChart
          buckets={buckets}
          totalSampled={totalSampled}
          withTtlCount={totalWithTtl}
        />
      </div>

      {/* Row 3: Soonest Expiring Keys (Live Countdown) */}
      <SoonestExpiringList
        keys={keys}
        totalWithTtl={totalWithTtl}
        totalSampled={totalSampled}
        onOpenBulkSet={() => setBulkSetOpen(true)}
      />

      {/* Bulk Set TTL Modal */}
      <BulkSetTtlModal
        isOpen={bulkSetOpen}
        onClose={() => setBulkSetOpen(false)}
        onApplied={fetchData}
      />
    </div>
  );
};
