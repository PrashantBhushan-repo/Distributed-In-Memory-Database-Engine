import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  RefreshCw,
  HelpCircle,
  Database,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { PersistenceInfo, SnapshotInspectResult } from '../features/persistence/types';
import { SaveTimeline } from '../features/persistence/SaveTimeline';
import { DurabilityExplainer } from '../features/persistence/DurabilityExplainer';
import { SnapshotInspectorPanel } from '../features/persistence/SnapshotInspectorPanel';
import { RestoreGuideModal } from '../features/persistence/RestoreGuideModal';

export const PersistencePage: React.FC = () => {
  const [info, setInfo] = useState<PersistenceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [bgsaveLoading, setBgsaveLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [isRestoreGuideOpen, setIsRestoreGuideOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPersistence = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/persistence', { headers });
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to fetch persistence data');
      }
    } catch (err: any) {
      console.error('Error fetching persistence:', err);
      setError(err.message || 'Network error fetching persistence info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersistence();
  }, [fetchPersistence]);

  // Polling: fast polling (1.5s) if bgsave or rewrite is in progress, otherwise 5s
  useEffect(() => {
    const isBusy = info?.rdbBgsaveInProgress || info?.aofRewriteInProgress;
    const intervalTime = isBusy ? 1500 : 5000;
    const interval = setInterval(fetchPersistence, intervalTime);
    return () => clearInterval(interval);
  }, [fetchPersistence, info?.rdbBgsaveInProgress, info?.aofRewriteInProgress]);

  const handleBgsave = async () => {
    setBgsaveLoading(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/persistence/bgsave', {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        await fetchPersistence();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to trigger BGSAVE');
      }
    } catch (err: any) {
      alert(err.message || 'Error executing BGSAVE');
    } finally {
      setBgsaveLoading(false);
    }
  };

  const handleBgrewriteaof = async () => {
    setRewriteLoading(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/persistence/bgrewriteaof', {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        await fetchPersistence();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to trigger BGREWRITEAOF');
      }
    } catch (err: any) {
      alert(err.message || 'Error executing BGREWRITEAOF');
    } finally {
      setRewriteLoading(false);
    }
  };

  const handleUpdatePolicy = async (policy: 'always' | 'everysec' | 'no') => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/persistence/fsync', {
      method: 'POST',
      headers,
      body: JSON.stringify({ policy }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update fsync policy');
    }

    await fetchPersistence();
  };

  const handleInspectSnapshot = async (filePath: string): Promise<SnapshotInspectResult> => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/persistence/inspect-snapshot', {
      method: 'POST',
      headers,
      body: JSON.stringify({ filePath }),
    });

    return res.json();
  };

  if (loading && !info) {
    return (
      <div className="flex-1 p-8 bg-[#070b14] text-slate-100 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-sky-400" />
          <span>Loading persistence telemetry...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 bg-[#070b14] text-slate-100 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Persistence & Durability</h1>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 border border-slate-700">
                RDB + AOF
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Manage point-in-time binary RDB snapshots and append-only file replay logs
            </p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2">
          {/* Restore Guide Button */}
          <button
            onClick={() => setIsRestoreGuideOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>How do I restore?</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchPersistence}
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

      {/* Main Sections */}
      {info && (
        <div className="space-y-6">
          {/* 1. Timeline & Actions */}
          <SaveTimeline
            info={info}
            onBgsave={handleBgsave}
            onBgrewriteaof={handleBgrewriteaof}
            bgsaveLoading={bgsaveLoading}
            rewriteLoading={rewriteLoading}
          />

          {/* 2. Durability Tradeoff Explainer */}
          <DurabilityExplainer
            currentPolicy={info.aofFsyncPolicy}
            onUpdatePolicy={handleUpdatePolicy}
          />

          {/* 3. Snapshot Binary Inspector */}
          <SnapshotInspectorPanel onInspect={handleInspectSnapshot} />
        </div>
      )}

      {/* Restore Guide Modal */}
      <RestoreGuideModal
        isOpen={isRestoreGuideOpen}
        onClose={() => setIsRestoreGuideOpen(false)}
      />
    </div>
  );
};
