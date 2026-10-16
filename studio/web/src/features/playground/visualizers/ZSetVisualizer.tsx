import React from 'react';
import { ZSetStructure } from '../types';
import { Layers, ArrowRight, TrendingUp } from 'lucide-react';

interface ZSetVisualizerProps {
  structure: ZSetStructure;
  reducedMotion?: boolean;
}

export const ZSetVisualizer: React.FC<ZSetVisualizerProps> = ({
  structure,
  reducedMotion = false,
}) => {
  const isSkiplist = structure.encoding === 'skiplist';

  return (
    <div className="space-y-4">
      {/* Encoding & Explanation Header */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Active Encoding:</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                isSkiplist
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isSkiplist ? 'skiplist (Multi-level Pointer Towers)' : 'listpack (Ordered Interleaved Pairs)'}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">Total Items: {structure.count}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{structure.explanation}</p>
      </div>

      {/* Visual Representation */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 overflow-x-auto">
        {!isSkiplist ? (
          /* Listpack Sorted Member-Score Pairs */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Compact Sorted Listpack</span>
              <span>Sorted by score in ascending order</span>
            </div>

            <div className="flex flex-wrap gap-2 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              {structure.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-emerald-500/30 font-mono text-xs hover:border-emerald-400 transition-colors"
                >
                  <span className="font-bold text-slate-200">{item.member}</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px]">
                    score: {item.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Skiplist Level Towers */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Probabilistic SkipList Towers (O(log N) forward pointers)</span>
              <span>Sorted score order at bottom level (L1)</span>
            </div>

            <div className="flex items-end gap-3 p-4 bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto min-h-60">
              {/* Header sentinel tower */}
              <div className="flex flex-col items-center gap-1 shrink-0 pb-1">
                <span className="text-[10px] font-mono text-slate-500 font-bold mb-1">HEAD</span>
                {Array.from({ length: 5 }).map((_, lIdx) => (
                  <div
                    key={lIdx}
                    className="w-12 h-7 rounded border border-slate-700 bg-slate-800 flex items-center justify-center font-mono text-[10px] text-slate-400"
                  >
                    L{5 - lIdx}
                  </div>
                ))}
                <span className="text-[10px] font-mono text-slate-600 mt-1">SENTINEL</span>
              </div>

              {/* Member towers */}
              {structure.items.map((item, idx) => {
                const itemLevel = Math.max(1, Math.min(5, item.level || 1));
                return (
                  <div key={idx} className="flex flex-col items-center gap-1 shrink-0 pb-1">
                    <span className="text-[10px] font-mono text-amber-400 font-bold mb-1">
                      score: {item.score}
                    </span>

                    {/* Tower levels */}
                    {Array.from({ length: 5 }).map((_, lIdx) => {
                      const levelNum = 5 - lIdx;
                      const hasLevel = levelNum <= itemLevel;
                      return (
                        <div
                          key={levelNum}
                          className={`w-16 h-7 rounded flex items-center justify-center font-mono text-[10px] transition-all ${
                            hasLevel
                              ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300 font-bold'
                              : 'bg-slate-950/40 border border-slate-800/40 text-slate-700'
                          }`}
                        >
                          {hasLevel ? `L${levelNum} ➔` : '—'}
                        </div>
                      );
                    })}

                    <span
                      className="text-xs font-mono font-bold text-slate-200 mt-1 truncate max-w-20 text-center"
                      title={item.member}
                    >
                      {item.member}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
