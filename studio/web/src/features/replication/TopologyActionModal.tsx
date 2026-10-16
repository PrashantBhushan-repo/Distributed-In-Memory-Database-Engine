import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Unlock,
  Server,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { ReplicationPreflight, PreflightCheckItem } from './types';

interface TopologyActionModalProps {
  action: 'replicaof' | 'promote';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { host?: string; port?: number; unlock: boolean }) => Promise<void>;
  fetchPreflight: (action: 'replicaof' | 'promote', host?: string, port?: number) => Promise<ReplicationPreflight>;
}

export const TopologyActionModal: React.FC<TopologyActionModalProps> = ({
  action,
  isOpen,
  onClose,
  onConfirm,
  fetchPreflight,
}) => {
  const [host, setHost] = useState('10.0.1.99');
  const [port, setPort] = useState(6379);
  const [unlock, setUnlock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preflight, setPreflight] = useState<ReplicationPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUnlock(false);
    setError(null);

    const loadPreflight = async () => {
      setPreflightLoading(true);
      try {
        const res = await fetchPreflight(action, action === 'replicaof' ? host : undefined, action === 'replicaof' ? port : undefined);
        setPreflight(res);
      } catch (err: any) {
        setError(err.message || 'Failed to run preflight check');
      } finally {
        setPreflightLoading(false);
      }
    };

    loadPreflight();
  }, [isOpen, action, host, port, fetchPreflight]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlock) return;

    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        host: action === 'replicaof' ? host : undefined,
        port: action === 'replicaof' ? port : undefined,
        unlock,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Topology mutation failed');
    } finally {
      setLoading(false);
    }
  };

  const isReplicaOf = action === 'replicaof';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0d1322] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                isReplicaOf
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {isReplicaOf ? 'Attach Replica to Primary (REPLICAOF)' : 'Promote Replica to Master (REPLICAOF NO ONE)'}
              </h2>
              <p className="text-xs text-slate-400">
                {isReplicaOf ? 'Configure this node to follow a primary' : 'Detach from primary and accept writes'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Target inputs if REPLICAOF */}
          {isReplicaOf && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Target Master Host/IP</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                  placeholder="10.0.1.99 or master.internal"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  required
                  min={1}
                  max={65535}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:border-amber-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* Preflight Checklist Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Pre-Flight Safety Checklist
              </span>
              {preflight && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                    preflight.dataLossRisk === 'high'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : preflight.dataLossRisk === 'low'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  RISK: {preflight.dataLossRisk.toUpperCase()}
                </span>
              )}
            </div>

            {preflightLoading ? (
              <div className="text-xs text-slate-500 py-2">Analyzing cluster topology safety...</div>
            ) : (
              <div className="space-y-2">
                {preflight?.checklist.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/40 text-xs"
                  >
                    {item.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : item.severity === 'critical' ? (
                      <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-slate-200">{item.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{item.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Explanation Warning */}
          {preflight && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 leading-relaxed">
              <strong>Impact Summary:</strong> {preflight.explanation}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Confirm & Unlock Toggle */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unlock}
                onChange={(e) => setUnlock(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0"
              />
              <span>I confirm and understand the replication impact</span>
            </label>
            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
              {unlock ? (
                <Unlock className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-slate-500" />
              )}
              <span>{unlock ? 'Unlocked' : 'Locked'}</span>
            </div>
          </div>

          {/* Footer controls */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !unlock}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-all shadow-md ${
                !unlock || loading
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : isReplicaOf
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
              }`}
            >
              <span>{loading ? 'Executing...' : isReplicaOf ? 'Execute REPLICAOF' : 'Promote to Master'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
