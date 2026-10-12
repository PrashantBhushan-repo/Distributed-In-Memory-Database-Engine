import React from 'react';
import { Layers, Activity, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { InfoTip } from '../../components/InfoTip';

interface FragmentationCardProps {
  ratio: number;
  usedMemoryBytes: number;
}

export const FragmentationCard: React.FC<FragmentationCardProps> = ({ ratio, usedMemoryBytes }) => {
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  let badgeText = 'Optimal';
  let interpretation = '1.0 to 1.3 is healthy. Allocator memory matches resident physical memory.';

  if (ratio < 0.95) {
    status = 'warning';
    badgeText = 'Swapping Risk';
    interpretation = 'Ratio < 1.0 indicates physical memory is being paged/swapped out by the operating system kernel.';
  } else if (ratio > 1.5) {
    status = 'critical';
    badgeText = 'Excess Fragmentation';
    interpretation = 'Above 1.5 indicates significant heap fragmentation; unused resident RAM is retained by jemalloc allocator.';
  } else if (ratio > 1.3) {
    status = 'warning';
    badgeText = 'Elevated';
    interpretation = 'Ratio between 1.3 and 1.5. Memory overhead is growing; keep an eye on volatile key turnover.';
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-3">
        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-slate-200">Memory Fragmentation Ratio</span>
          <InfoTip content="mem_fragmentation_ratio is used_memory_rss / used_memory. 1.1 to 1.2 is ideal. Higher values indicate heap allocator fragmentation." />
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            status === 'healthy'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
              : status === 'warning'
              ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
              : 'bg-red-950 text-red-400 border border-red-800/60'
          }`}
        >
          {status === 'healthy' ? (
            <CheckCircle className="h-3 w-3" />
          ) : status === 'warning' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          {badgeText}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-mono text-3xl font-extrabold text-white tracking-tight">
          {ratio.toFixed(2)}
        </span>
        <span className="text-[11px] text-slate-400">rss / allocated</span>
      </div>

      <div className="rounded-lg bg-slate-950/70 p-2.5 border border-slate-850 space-y-1">
        <div className="text-[11px] font-medium text-slate-300">
          {interpretation}
        </div>
        <div className="text-[10px] text-slate-400">
          Tip: Run <code className="bg-slate-900 px-1 py-0.5 rounded text-sky-300">MEMORY PURGE</code> to instruct jemalloc to release unused dirty arenas back to the OS.
        </div>
      </div>
    </div>
  );
};
