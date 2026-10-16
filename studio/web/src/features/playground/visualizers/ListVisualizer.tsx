import React from 'react';
import { ListStructure } from '../types';
import { Layers, ArrowRight, ArrowLeftRight, CheckCircle } from 'lucide-react';

interface ListVisualizerProps {
  structure: ListStructure;
  reducedMotion?: boolean;
}

export const ListVisualizer: React.FC<ListVisualizerProps> = ({
  structure,
  reducedMotion = false,
}) => {
  const isQuicklist = structure.encoding === 'quicklist';

  return (
    <div className="space-y-4">
      {/* Encoding & Explanation Header */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Active Encoding:</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                isQuicklist
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isQuicklist ? 'quicklist (Linked List of Listpacks)' : 'listpack (Compact Sequence)'}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">Total Items: {structure.totalEntries}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{structure.explanation}</p>
      </div>

      {/* Visual Representation */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 overflow-x-auto">
        {!isQuicklist ? (
          /* Listpack Contiguous Memory View */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Compact Listpack Byte Stream</span>
              <span>Single contiguous buffer (≤ 512 elements, ≤ 64B each)</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 min-h-16 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              {structure.entries.length === 0 ? (
                <span className="text-xs text-slate-500 italic">List is empty. Use LPUSH or RPUSH to add elements.</span>
              ) : (
                structure.entries.map((entry, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center bg-slate-900 border border-emerald-500/30 rounded-lg p-2 min-w-16 shadow-sm hover:border-emerald-400 transition-colors"
                  >
                    <span className="text-[10px] font-mono text-slate-500">[{idx}]</span>
                    <span className="text-xs font-mono font-semibold text-slate-100 truncate max-w-28" title={entry}>
                      {entry}
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400/80 mt-1">
                      {new TextEncoder().encode(entry).length}B + backlen
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Quicklist Doubly-Linked Nodes View */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Quicklist Architecture (quicklistNode doubly-linked list)</span>
              <span>Elements partitioned into separate listpack chunks</span>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto py-2">
              {(structure.quicklistNodes || []).map((node, nodeIdx) => (
                <React.Fragment key={nodeIdx}>
                  <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-xl space-y-2 min-w-56 shrink-0 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-400 pb-1 border-b border-slate-800">
                      <span>Node #{node.nodeIndex}</span>
                      <span className="text-[10px] text-slate-400">{node.entries.length} items ({node.sizeBytes}B)</span>
                    </div>

                    <div className="space-y-1">
                      {node.entries.map((val, eIdx) => (
                        <div
                          key={eIdx}
                          className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 truncate"
                          title={val}
                        >
                          {val}
                        </div>
                      ))}
                    </div>
                  </div>

                  {nodeIdx < (structure.quicklistNodes || []).length - 1 && (
                    <div className="flex flex-col items-center text-slate-500 px-1 shrink-0">
                      <ArrowLeftRight className="w-5 h-5 text-amber-400/60" />
                      <span className="text-[9px] font-mono mt-0.5">prev / next</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
