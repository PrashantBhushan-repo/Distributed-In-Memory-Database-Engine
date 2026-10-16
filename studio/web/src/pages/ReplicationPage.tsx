import React, { useState, useEffect, useCallback } from 'react';
import {
  GitFork,
  RefreshCw,
  Server,
  Database,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  Layers,
  Zap,
} from 'lucide-react';
import { ReplicationTopology, ReplicationPreflight } from '../features/replication/types';
import { TopologyGraph } from '../features/replication/TopologyGraph';
import { ReplicaCard } from '../features/replication/ReplicaCard';
import { BacklogGauge } from '../features/replication/BacklogGauge';
import { TopologyActionModal } from '../features/replication/TopologyActionModal';
import { InfoTip } from '../components/InfoTip';

export const ReplicationPage: React.FC = () => {
  const [topology, setTopology] = useState<ReplicationTopology | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [activeModalAction, setActiveModalAction] = useState<'replicaof' | 'promote' | null>(null);

  const fetchTopology = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/replication', { headers });
      if (res.ok) {
        const data = await res.json();
        setTopology(data);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to fetch replication topology');
      }
    } catch (err: any) {
      console.error('Error fetching replication:', err);
      setError(err.message || 'Network error fetching replication topology');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  // Auto-refresh interval (3 seconds for live streaming)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchTopology, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTopology]);

  const handleFetchPreflight = async (
    action: 'replicaof' | 'promote',
    host?: string,
    port?: number
  ): Promise<ReplicationPreflight> => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const params = new URLSearchParams({ action });
    if (host) params.set('host', host);
    if (port) params.set('port', String(port));

    const res = await fetch(`/api/replication/preflight?${params.toString()}`, { headers });
    return res.json();
  };

  const handleActionConfirm = async (payload: { host?: string; port?: number; unlock: boolean }) => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const endpoint = activeModalAction === 'replicaof' ? '/api/replication/replicaof' : '/api/replication/promote';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to alter replication topology');
    }

    await fetchTopology();
  };

  if (loading && !topology) {
    return (
      <div className="flex-1 p-8 bg-[#070b14] text-slate-100 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-sky-400" />
          <span>Mapping replication topology...</span>
        </div>
      </div>
    );
  }

  const isMaster = topology?.role === 'master';

  return (
    <div className="flex-1 space-y-6 p-6 bg-[#070b14] text-slate-100 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <GitFork className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Replication & Clustering</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  isMaster
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                }`}
              >
                {topology?.role.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Visualize real-time replication streams, offset gaps, and PSYNC ring backlogs
            </p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2">
          {/* REPLICAOF Action Button */}
          {isMaster ? (
            <button
              onClick={() => setActiveModalAction('replicaof')}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              <GitFork className="h-3.5 w-3.5" />
              <span>Attach as Replica</span>
            </button>
          ) : (
            <button
              onClick={() => setActiveModalAction('promote')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>Promote to Master</span>
            </button>
          )}

          {/* Auto-Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              autoRefresh
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
            title="Auto-refresh every 3 seconds"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span>{autoRefresh ? 'Live (3s)' : 'Paused'}</span>
          </button>

          {/* Manual Refresh */}
          <button
            onClick={fetchTopology}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {topology && (
        <div className="space-y-6">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4">
              <span className="text-xs font-medium text-slate-400">Node Role</span>
              <div className="text-lg font-bold font-mono text-white mt-1 uppercase">
                {topology.role}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                {isMaster ? 'Accepting reads & writes' : 'Read-only replica'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4">
              <span className="text-xs font-medium text-slate-400">Connected Replicas</span>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                {topology.connectedSlaves} active
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Streaming replication feed
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Stream Offset</span>
                <InfoTip content="Current cumulative byte position in the replication stream generated by the primary node." />
              </div>
              <div className="text-lg font-bold font-mono text-sky-400 mt-1">
                {topology.masterReplOffset.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Bytes processed
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">PSYNC Tolerance</span>
                <InfoTip content="Estimated seconds a replica can lose connection and still execute a fast partial resynchronization." />
              </div>
              <div className="text-lg font-bold font-mono text-amber-400 mt-1">
                ~{topology.backlogCoverageSeconds}s
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Backlog buffer window
              </div>
            </div>
          </div>

          {/* 1. Live Topology SVG Graph */}
          <TopologyGraph topology={topology} />

          {/* 2. PSYNC Backlog Ring Buffer Gauge */}
          <BacklogGauge
            backlogActive={topology.replBacklogActive}
            backlogSize={topology.replBacklogSize}
            backlogHistlen={topology.replBacklogHistlen}
            coverageSeconds={topology.backlogCoverageSeconds}
          />

          {/* 3. Connected Replicas List */}
          {topology.replicas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Connected Downstream Replicas ({topology.replicas.length})
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  Individual node synchronization telemetry
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topology.replicas.map((rep) => (
                  <ReplicaCard
                    key={rep.id}
                    replica={rep}
                    masterOffset={topology.masterReplOffset}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Modal (REPLICAOF / PROMOTE) */}
      {activeModalAction && (
        <TopologyActionModal
          action={activeModalAction}
          isOpen={Boolean(activeModalAction)}
          onClose={() => setActiveModalAction(null)}
          onConfirm={handleActionConfirm}
          fetchPreflight={handleFetchPreflight}
        />
      )}
    </div>
  );
};
