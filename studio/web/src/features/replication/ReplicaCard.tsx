import React from 'react';
import { Server, Clock, Zap, Layers, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ReplicaNodeInfo } from './types';
import { InfoTip } from '../../components/InfoTip';

interface ReplicaCardProps {
  replica: ReplicaNodeInfo;
  masterOffset: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const ReplicaCard: React.FC<ReplicaCardProps> = ({ replica, masterOffset }) => {
  const isOnline = replica.state === 'online';
  const isLagging = replica.lagSeconds > 0 || replica.lagBytes > 1024;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-700 transition-colors">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-sky-400" />
            <h4 className="text-sm font-bold font-mono text-white">
              {replica.ip}:{replica.port}
            </h4>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            {replica.state.toUpperCase()}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono mt-0.5">ID: {replica.id}</div>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Replication Stream Offset */}
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Stream Offset</span>
            <InfoTip content="Monotonically increasing byte counter representing the replica's consumed position in the master's replication stream." />
          </div>
          <div className="text-xs font-mono font-bold text-white mt-1">
            {replica.offset.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {masterOffset - replica.offset === 0 ? '0 B behind master' : `${(masterOffset - replica.offset).toLocaleString()} B behind`}
          </div>
        </div>

        {/* Replication Lag */}
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Replication Lag</span>
            <InfoTip content="Time in seconds and bytes since the primary received the last ACK reply from this replica." />
          </div>
          <div
            className={`text-xs font-mono font-bold mt-1 ${
              isLagging ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {replica.lagSeconds === 0 ? '0 seconds' : `${replica.lagSeconds}s lag`}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {formatBytes(replica.lagBytes)} buffer
          </div>
        </div>
      </div>

      {/* Footer details */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock className="h-3 w-3 text-slate-500" />
          <span>Last ACK: <strong className="text-slate-300 font-mono">{replica.lastAckSecondsAgo}s ago</strong></span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Sync Mode:</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
              replica.syncType === 'partial_resync'
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
            }`}
          >
            {replica.syncType === 'partial_resync' ? 'PSYNC (Partial)' : 'FULL SYNC'}
          </span>
        </div>
      </div>
    </div>
  );
};
