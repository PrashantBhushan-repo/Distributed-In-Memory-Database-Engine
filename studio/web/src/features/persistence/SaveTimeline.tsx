import React from 'react';
import {
  Database,
  FileText,
  Clock,
  HardDrive,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Play,
  Zap,
} from 'lucide-react';
import { PersistenceInfo, SaveTimelineItem } from './types';
import { InfoTip } from '../../components/InfoTip';

interface SaveTimelineProps {
  info: PersistenceInfo;
  onBgsave: () => void;
  onBgrewriteaof: () => void;
  bgsaveLoading: boolean;
  rewriteLoading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function timeAgo(epochSec: number): string {
  if (!epochSec) return 'Not reported';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

export const SaveTimeline: React.FC<SaveTimelineProps> = ({
  info,
  onBgsave,
  onBgrewriteaof,
  bgsaveLoading,
  rewriteLoading,
}) => {
  const isBgsaveActive = info.rdbBgsaveInProgress || bgsaveLoading;
  const isRewriteActive = info.aofRewriteInProgress || rewriteLoading;

  // Max change indicator scale for visual gauge
  const changesScale = Math.min(100, Math.round((info.rdbChangesSinceLastSave / 1000) * 100));

  return (
    <div className="space-y-4">
      {/* Action triggers & Changes gauge strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Changes since last save card */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-sky-400" />
              Changes Since Last Save
            </span>
            <InfoTip content="Accumulated key mutations since the last successful point-in-time RDB snapshot. Redis triggers automated background saves when change count & time criteria in redis.conf are met." />
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">
                {info.rdbChangesSinceLastSave.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-mono">mutations</span>
            </div>
            {/* Visual progress bar */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  changesScale > 80
                    ? 'bg-amber-500'
                    : changesScale > 50
                    ? 'bg-sky-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(5, changesScale)}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Last RDB: {timeAgo(info.rdbLastSaveTime)}</span>
            <span className="text-slate-500 font-mono">{info.rdbLastBgsaveTimeSec}s duration</span>
          </div>
        </div>

        {/* Trigger BGSAVE Card */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-emerald-400" />
                RDB Snapshot Engine
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  info.rdbLastBgsaveStatus === 'ok'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}
              >
                {info.rdbLastBgsaveStatus.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Forks a background child process to write the full keyspace to disk in a compact binary snapshot file (<code className="text-slate-300">dump.rdb</code>).
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">
              Command: <code className="text-emerald-400 font-semibold">BGSAVE</code>
            </span>
            <button
              onClick={onBgsave}
              disabled={isBgsaveActive}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isBgsaveActive
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isBgsaveActive ? 'animate-spin' : ''}`} />
              <span>{isBgsaveActive ? 'Saving...' : 'Trigger BGSAVE'}</span>
            </button>
          </div>
        </div>

        {/* Trigger BGREWRITEAOF Card */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                Append-Only File (AOF)
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  info.aofEnabled
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {info.aofEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Replays a stream of write commands. Rewriting consolidates redundant operations into the shortest sequence needed to rebuild the keyspace.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">
              Command: <code className="text-purple-400 font-semibold">BGREWRITEAOF</code>
            </span>
            <button
              onClick={onBgrewriteaof}
              disabled={isRewriteActive || !info.aofEnabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isRewriteActive || !info.aofEnabled
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-xs'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRewriteActive ? 'animate-spin' : ''}`} />
              <span>{isRewriteActive ? 'Rewriting...' : 'Rewrite AOF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Timeline List of Last Saves */}
      <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">Persistence Event History</h3>
          </div>
          <span className="text-xs text-slate-400">
            {info.saveTimeline.length} events logged
          </span>
        </div>

        <div className="space-y-3">
          {info.saveTimeline.map((item, idx) => (
            <div
              key={item.id || idx}
              className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                    item.type === 'rdb'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                  }`}
                >
                  {item.type === 'rdb' ? (
                    <Database className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      {item.type === 'rdb' ? 'RDB Snapshot' : 'AOF Rewrite'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      ({timeAgo(item.timestamp)})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono mt-0.5">
                    <span>{new Date(item.timestamp * 1000).toLocaleTimeString()}</span>
                    <span>•</span>
                    <span>{formatBytes(item.sizeBytes)}</span>
                    {item.keysCount && (
                      <>
                        <span>•</span>
                        <span>{item.keysCount.toLocaleString()} keys</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-slate-400">
                  took <strong className="text-slate-200">{item.durationSec}s</strong>
                </span>
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    item.status === 'ok'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{item.status.toUpperCase()}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
