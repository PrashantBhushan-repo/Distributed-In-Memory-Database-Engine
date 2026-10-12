import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, Sliders, Trash2, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { SlowLogEntry, SlowLogCauseHint } from '../features/slowlog/types';
import { SlowLogTable } from '../features/slowlog/SlowLogTable';
import { CauseExplanationDrawer } from '../features/slowlog/CauseExplanationDrawer';
import { ThresholdConfigModal } from '../features/slowlog/ThresholdConfigModal';

export const SlowlogPage: React.FC = () => {
  const [entries, setEntries] = useState<SlowLogEntry[]>([]);
  const [thresholdUs, setThresholdUs] = useState(10000);
  const [totalLen, setTotalLen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & drawers
  const [selectedHint, setSelectedHint] = useState<SlowLogCauseHint | null>(null);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchSlowLog = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/slowlog?n=100', { headers });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        if (typeof data.thresholdUs === 'number') {
          setThresholdUs(data.thresholdUs);
        }
        if (typeof data.len === 'number') {
          setTotalLen(data.len);
        }
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to load slow query log');
      }
    } catch (err: any) {
      console.error('Error fetching slow log:', err);
      setError(err.message || 'Network error fetching slow log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlowLog();
  }, [fetchSlowLog]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSlowLog, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSlowLog]);

  const handleResetSlowLog = async () => {
    setResetting(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/slowlog/reset', {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        setIsResetConfirmOpen(false);
        await fetchSlowLog();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to reset slow log (Admin role required)');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing SLOWLOG RESET');
    } finally {
      setResetting(false);
    }
  };

  const handleSaveThreshold = async (us: number, unlock: boolean) => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/slowlog/config', {
      method: 'POST',
      headers,
      body: JSON.stringify({ microseconds: us, unlock }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update threshold. Requires Admin role.');
    }

    await fetchSlowLog();
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
              <h1 className="text-xl font-bold tracking-tight text-white">Slow Query Log</h1>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 border border-slate-700">
                {totalLen} recorded
              </span>
            </div>
            <p className="text-xs text-slate-400">
              In-memory log of execution times that exceeded <code className="text-amber-400">{thresholdUs.toLocaleString()} µs ({thresholdUs / 1000} ms)</code>
            </p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              autoRefresh
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
            title="Auto-refresh every 5 seconds"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span>{autoRefresh ? 'Live (5s)' : 'Paused'}</span>
          </button>

          {/* Manual Refresh */}
          <button
            onClick={fetchSlowLog}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>

          {/* Configure Threshold */}
          <button
            onClick={() => setIsThresholdModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Threshold</span>
          </button>

          {/* Reset Log */}
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Log</span>
          </button>
        </div>
      </div>

      {/* Error alert if any */}
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

      {/* Main Table Content */}
      <SlowLogTable
        entries={entries}
        thresholdUs={thresholdUs}
        totalLen={totalLen}
        onOpenThresholdConfig={() => setIsThresholdModalOpen(true)}
        onResetSlowLog={() => setIsResetConfirmOpen(true)}
        onExplainCause={(hint) => setSelectedHint(hint)}
      />

      {/* Cause Explanation Slide-over Drawer */}
      <CauseExplanationDrawer
        hint={selectedHint}
        isOpen={Boolean(selectedHint)}
        onClose={() => setSelectedHint(null)}
      />

      {/* Threshold Configuration Modal */}
      <ThresholdConfigModal
        currentThresholdUs={thresholdUs}
        isOpen={isThresholdModalOpen}
        onClose={() => setIsThresholdModalOpen(false)}
        onSave={handleSaveThreshold}
      />

      {/* Reset Confirmation Dialog */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-red-500/40 bg-[#0d1322] p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 border border-red-500/30">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Reset Slow Query Log</h3>
                <p className="text-xs text-slate-400">Execute SLOWLOG RESET</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              This will discard all <strong className="text-white">{totalLen}</strong> recorded entries in the Redis server's in-memory slow log buffer. Historical query latency entries will no longer be visible.
            </p>

            <div className="rounded-lg bg-slate-950/80 p-3 border border-slate-800 text-[11px] font-mono text-slate-400 mb-6">
              Command: <span className="text-red-400 font-semibold">SLOWLOG RESET</span>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                disabled={resetting}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetSlowLog}
                disabled={resetting}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors shadow-lg shadow-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{resetting ? 'Resetting...' : 'Yes, Reset Slow Log'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
