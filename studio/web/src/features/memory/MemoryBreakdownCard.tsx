import React, { useState } from 'react';
import { PieChart, Layers, Tag, Database } from 'lucide-react';
import { MemoryTypeBreakdown, MemoryPrefixBreakdown } from './types';

interface MemoryBreakdownCardProps {
  perType: MemoryTypeBreakdown[];
  perPrefix: MemoryPrefixBreakdown[];
  estimated: boolean;
  sampledKeys: number;
}

export const MemoryBreakdownCard: React.FC<MemoryBreakdownCardProps> = ({
  perType,
  perPrefix,
  estimated,
  sampledKeys,
}) => {
  const [viewMode, setViewMode] = useState<'type' | 'prefix'>('type');

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'string':
        return 'bg-emerald-500 text-emerald-400';
      case 'hash':
        return 'bg-amber-500 text-amber-400';
      case 'list':
        return 'bg-cyan-500 text-cyan-400';
      case 'set':
        return 'bg-purple-500 text-purple-400';
      case 'zset':
        return 'bg-rose-500 text-rose-400';
      default:
        return 'bg-slate-500 text-slate-400';
    }
  };

  const getPrefixColor = (index: number) => {
    const palette = [
      'bg-sky-500 text-sky-400',
      'bg-indigo-500 text-indigo-400',
      'bg-emerald-500 text-emerald-400',
      'bg-amber-500 text-amber-400',
      'bg-rose-500 text-rose-400',
      'bg-teal-500 text-teal-400',
      'bg-violet-500 text-violet-400',
    ];
    return palette[index % palette.length];
  };

  const items = viewMode === 'type' ? perType : perPrefix;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header with View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-slate-200">Memory Breakdown</span>
          {estimated && (
            <span className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              Sampled ({sampledKeys.toLocaleString()} keys)
            </span>
          )}
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center rounded-lg bg-slate-900/90 p-0.5 border border-slate-800">
          <button
            onClick={() => setViewMode('type')}
            className={`flex items-center gap-1 rounded px-2.5 py-0.5 text-[11px] font-semibold transition ${
              viewMode === 'type'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3 w-3" /> By Type
          </button>
          <button
            onClick={() => setViewMode('prefix')}
            className={`flex items-center gap-1 rounded px-2.5 py-0.5 text-[11px] font-semibold transition ${
              viewMode === 'prefix'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="h-3 w-3" /> By Prefix
          </button>
        </div>
      </div>

      {/* Stacked Percentage Bar */}
      <div className="h-3 w-full rounded-full bg-slate-950 flex overflow-hidden border border-slate-800">
        {items.map((item, idx) => {
          const colorClass = viewMode === 'type'
            ? getTypeColor((item as MemoryTypeBreakdown).type).split(' ')[0]
            : getPrefixColor(idx).split(' ')[0];
          return (
            <div
              key={idx}
              style={{ width: `${Math.max(1, item.percentage)}%` }}
              title={`${(item as any).type || (item as any).prefix}: ${item.percentage}% (${formatBytes(item.bytes)})`}
              className={`${colorClass} hover:opacity-85 transition`}
            />
          );
        })}
      </div>

      {/* Breakdown Items List */}
      <div className="max-h-56 overflow-y-auto space-y-1.5 divide-y divide-slate-850 pt-1">
        {items.map((item, idx) => {
          const name = (item as any).type || (item as any).prefix;
          const colorClass = viewMode === 'type'
            ? getTypeColor(name)
            : getPrefixColor(idx);
          const [bgDot, textBadge] = colorClass.split(' ');

          return (
            <div key={idx} className="flex items-center justify-between pt-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${bgDot}`} />
                <span className={`font-mono font-bold ${textBadge}`}>
                  {name}
                </span>
                <span className="text-slate-400 text-[10px]">
                  ({item.count.toLocaleString()} keys)
                </span>
              </div>

              <div className="flex items-center gap-3 font-mono">
                <span className="text-slate-300">{formatBytes(item.bytes)}</span>
                <span className="font-bold text-white w-12 text-right">
                  {item.percentage}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
