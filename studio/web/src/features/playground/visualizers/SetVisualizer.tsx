import React from 'react';
import { SetStructure } from '../types';
import { Hash, Layers, Binary } from 'lucide-react';

interface SetVisualizerProps {
  structure: SetStructure;
  reducedMotion?: boolean;
}

export const SetVisualizer: React.FC<SetVisualizerProps> = ({
  structure,
  reducedMotion = false,
}) => {
  const isHashtable = structure.encoding === 'hashtable';
  const widthBits = structure.elementWidthBits || 16;

  const getWidthBadge = () => {
    switch (widthBits) {
      case 16:
        return 'INTSET_ENC_INT16 (2 Bytes/int, max 32,767)';
      case 32:
        return 'INTSET_ENC_INT32 (4 Bytes/int, max 2.14B)';
      case 64:
        return 'INTSET_ENC_INT64 (8 Bytes/int, 64-bit full)';
    }
  };

  return (
    <div className="space-y-4">
      {/* Encoding & Explanation Header */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Active Encoding:</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                isHashtable
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isHashtable ? 'hashtable (dict)' : `intset (${widthBits}-bit)`}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">Members: {structure.memberCount}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{structure.explanation}</p>
      </div>

      {/* Visual Representation */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 overflow-x-auto">
        {!isHashtable ? (
          /* Intset Binary Sorted Array */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <Binary className="w-3.5 h-3.5 text-emerald-400" />
                <span>Binary Intset Array (Sorted Ascending)</span>
              </span>
              <span className="font-mono text-[11px] text-emerald-400 font-bold">{getWidthBadge()}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              {structure.members.map((val, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg bg-slate-900 border border-emerald-500/40 text-center transition-all ${
                    widthBits === 64
                      ? 'w-32 hover:border-emerald-300'
                      : widthBits === 32
                      ? 'w-24 hover:border-emerald-300'
                      : 'w-16 hover:border-emerald-300'
                  }`}
                >
                  <span className="text-[10px] font-mono text-slate-500">[{idx}]</span>
                  <span className="text-xs font-mono font-bold text-slate-100 truncate w-full" title={String(val)}>
                    {val}
                  </span>
                  <span className="text-[9px] font-mono text-emerald-400/80 mt-0.5">{widthBits}-bit</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Hashtable Set View */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Set Hash Table (dict entries with NULL value)</span>
              <span className="text-rose-400">{structure.reason || 'Converted from intset'}</span>
            </div>

            <div className="flex flex-wrap gap-2 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              {structure.members.map((val, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-amber-500/30 flex items-center gap-2 text-xs font-mono"
                >
                  <span className="text-amber-300 font-bold">{val}</span>
                  <span className="text-[10px] text-slate-500 font-mono">➔ (nil)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
