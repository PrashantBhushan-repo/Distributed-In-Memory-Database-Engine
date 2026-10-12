import React from 'react';
import { HashStructure } from '../types';
import { Hash, Layers, CheckCircle2 } from 'lucide-react';

interface HashVisualizerProps {
  structure: HashStructure;
  reducedMotion?: boolean;
}

export const HashVisualizer: React.FC<HashVisualizerProps> = ({
  structure,
  reducedMotion = false,
}) => {
  const isHashtable = structure.encoding === 'hashtable';

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
              {isHashtable ? 'hashtable (dict with buckets)' : 'listpack (Compact Pairs)'}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">Fields: {structure.fieldCount}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{structure.explanation}</p>
      </div>

      {/* Visual Representation */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 overflow-x-auto">
        {!isHashtable ? (
          /* Listpack Key-Value Pairs */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Compact Listpack Key/Value Array</span>
              <span>Interleaved field and value contiguous chunks</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {structure.fields.map((f, idx) => (
                <div
                  key={idx}
                  className="flex flex-col p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800">
                    <span className="text-[11px] font-mono font-bold text-sky-400 truncate" title={f.field}>
                      {f.field}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">#{idx}</span>
                  </div>
                  <div className="text-xs font-mono text-slate-200 truncate" title={f.value}>
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Hash Table Buckets View */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Dictionary Hash Buckets (dictEntry chains)</span>
              <span>Load Factor: {structure.bucketOccupancy ?? 1.0}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(structure.buckets || []).map((bucket) => (
                <div
                  key={bucket.bucketIndex}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-400 pb-1 border-b border-slate-800">
                    <span>Bucket #{bucket.bucketIndex}</span>
                    <span className="text-[10px] text-slate-500">{bucket.items.length} items</span>
                  </div>

                  {bucket.items.length === 0 ? (
                    <div className="text-[10px] text-slate-600 font-mono italic py-1">empty</div>
                  ) : (
                    <div className="space-y-1">
                      {bucket.items.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="p-1.5 rounded bg-slate-950 border border-amber-500/20 text-[10px] font-mono text-slate-200"
                        >
                          <div className="font-bold text-amber-300 truncate">{item.field}</div>
                          <div className="text-slate-400 truncate">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
