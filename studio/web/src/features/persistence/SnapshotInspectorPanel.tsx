import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  Database,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { SnapshotInspectResult } from './types';
import { InfoTip } from '../../components/InfoTip';

interface SnapshotInspectorPanelProps {
  onInspect: (filePath: string) => Promise<SnapshotInspectResult>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const SnapshotInspectorPanel: React.FC<SnapshotInspectorPanelProps> = ({ onInspect }) => {
  const [filePath, setFilePath] = useState('dump.rdb');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SnapshotInspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunInspect = async (pathOverride?: string) => {
    const target = pathOverride || filePath;
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await onInspect(target);
      setResult(res);
      if (!res.valid) {
        setError(res.error || 'Failed to inspect snapshot file');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing snapshot inspector');
    } finally {
      setLoading(false);
    }
  };

  const TYPE_COLORS: Record<string, string> = {
    string: 'bg-emerald-500',
    hash: 'bg-purple-500',
    list: 'bg-blue-500',
    set: 'bg-amber-500',
    zset: 'bg-rose-500',
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-white">RDB Snapshot Binary Inspector</h3>
          <InfoTip content="Pluggable inspector that decodes binary RDB snapshots without starting a Redis instance. Verifies magic header bytes, protocol version, CRC64 integrity trailer, and keyspace composition." />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setFilePath('dump.rdb');
              handleRunInspect('dump.rdb');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            <span>Load Demo dump.rdb</span>
          </button>
        </div>
      </div>

      {/* Path input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRunInspect();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="Path to snapshot (e.g. dump.rdb, /var/lib/redis/dump.rdb)"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono placeholder:text-slate-600 focus:outline-hidden focus:border-sky-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !filePath.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Inspecting...' : 'Inspect File'}
        </button>
      </form>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Inspection Results display */}
      {result && result.valid && (
        <div className="space-y-4 pt-2">
          {/* Header Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400">RDB Format & Version</span>
              <div className="text-sm font-bold font-mono text-white mt-0.5">
                {result.format} v{result.version}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400">CRC64 Integrity</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">VALID</span>
                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[80px]">
                  ({result.crcExpected})
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400">Snapshot File Size</span>
              <div className="text-sm font-bold font-mono text-white mt-0.5">
                {formatBytes(result.fileSizeBytes)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400">Total Encoded Keys</span>
              <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                {result.totalKeys.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Auxiliary metadata strip */}
          <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 font-mono">
            <span>Server: <strong className="text-slate-200">Redis {result.auxFields.redisVersion}</strong> ({result.auxFields.redisBits}-bit)</span>
            <span>•</span>
            <span>Created: <strong className="text-slate-200">{new Date(result.auxFields.ctime * 1000).toLocaleString()}</strong></span>
            <span>•</span>
            <span>Original RAM: <strong className="text-slate-200">{formatBytes(result.auxFields.usedMemoryBytes)}</strong></span>
          </div>

          {/* Record counts breakdown chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">Data Type Distribution</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {result.recordCounts.length} types present
              </span>
            </div>

            {/* Stacked bar */}
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex mb-3">
              {result.recordCounts.map((rc) => (
                <div
                  key={rc.type}
                  style={{ width: `${rc.percentage}%` }}
                  className={`${TYPE_COLORS[rc.type] || 'bg-slate-500'} h-full transition-all`}
                  title={`${rc.type}: ${rc.count.toLocaleString()} keys (${rc.percentage}%)`}
                />
              ))}
            </div>

            {/* Legend cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {result.recordCounts.map((rc) => (
                <div
                  key={rc.type}
                  className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${TYPE_COLORS[rc.type] || 'bg-slate-500'}`}
                    />
                    <span className="text-xs font-mono font-semibold uppercase text-slate-200">
                      {rc.type}
                    </span>
                  </div>
                  <div className="text-xs font-bold font-mono text-white mt-1">
                    {rc.count.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {formatBytes(rc.estimatedBytes)} ({rc.percentage}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
