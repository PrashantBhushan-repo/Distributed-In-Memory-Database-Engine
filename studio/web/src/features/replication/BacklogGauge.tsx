import React from 'react';
import { Database, ShieldCheck, Zap, Info, Layers } from 'lucide-react';
import { InfoTip } from '../../components/InfoTip';

interface BacklogGaugeProps {
  backlogActive: boolean;
  backlogSize: number;
  backlogHistlen: number;
  coverageSeconds: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const BacklogGauge: React.FC<BacklogGaugeProps> = ({
  backlogActive,
  backlogSize,
  backlogHistlen,
  coverageSeconds,
}) => {
  const percentUsed = backlogSize > 0 ? Math.min(100, Math.round((backlogHistlen / backlogSize) * 100)) : 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-white">Replication Backlog (PSYNC Ring Buffer)</h3>
          <InfoTip content="A circular in-memory buffer allocated by the primary node. It holds recently streamed commands so temporarily disconnected replicas can catch up with a lightweight partial resync (PSYNC) instead of an expensive full RDB dump." />
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            backlogActive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {backlogActive ? 'RING BUFFER ACTIVE' : 'DISABLED'}
        </span>
      </div>

      {/* Progress & metrics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">
            Buffer Occupancy: <strong className="text-white">{formatBytes(backlogHistlen)}</strong> / {formatBytes(backlogSize)}
          </span>
          <span className="text-sky-400 font-bold">{percentUsed}% utilized</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-500 rounded-full"
            style={{ width: `${percentUsed}%` }}
          />
        </div>
      </div>

      {/* Plain-English Offline Tolerance Sentence */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4">
        <div className="flex items-start gap-3">
          <Zap className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-sky-300">Partial resynchronization window</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {coverageSeconds > 0 ? `Estimated coverage: about ${coverageSeconds} seconds at the observed write rate. This estimate changes with traffic.` : 'Coverage cannot be estimated until the engine reports both backlog size and replication write rate.'}
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Explainer Pill */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-emerald-400">
            <Zap className="h-3.5 w-3.5" />
            <span>Partial Resynchronization (Fast)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal">
            When offline time &lt; {coverageSeconds}s, the primary sends only missing differential stream bytes. Near-zero CPU and disk overhead.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-400">
            <Database className="h-3.5 w-3.5" />
            <span>Full Resynchronization (Expensive)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal">
            If offline time exceeds backlog capacity, primary forks BGSAVE, dumps entire keyspace to disk, and replica flushes its dataset to reload.
          </p>
        </div>
      </div>
    </div>
  );
};
