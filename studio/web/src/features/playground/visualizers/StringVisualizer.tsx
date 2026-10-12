import React from 'react';
import { StringStructure } from '../types';
import { Cpu, Layers, ArrowRight, CheckCircle2 } from 'lucide-react';

interface StringVisualizerProps {
  structure: StringStructure;
  reducedMotion?: boolean;
}

export const StringVisualizer: React.FC<StringVisualizerProps> = ({
  structure,
  reducedMotion = false,
}) => {
  const chars = structure.value.split('');

  const getEncodingBadge = () => {
    switch (structure.encoding) {
      case 'int':
        return { label: 'int (Integer in pointer)', bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' };
      case 'embstr':
        return { label: 'embstr (Contiguous SDS ≤ 44B)', bg: 'bg-sky-500/10 border-sky-500/30 text-sky-400' };
      case 'raw':
        return { label: 'raw (Separate SDS Allocation > 44B)', bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400' };
    }
  };

  const badge = getEncodingBadge();

  return (
    <div className="space-y-4">
      {/* Encoding & Explanation Header */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Active Encoding:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${badge.bg}`}>
              {badge.label}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">Length: {structure.length} Bytes</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{structure.explanation}</p>
      </div>

      {/* Memory Layout Diagram */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 overflow-x-auto">
        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
          <span>Physical Memory Layout (jemalloc heap chunk)</span>
          <span>{structure.contiguousWithRobj ? 'Contiguous (1 chunk)' : 'Dual Chunk (2 allocations)'}</span>
        </div>

        {/* Layout Visual Blocks */}
        <div className="flex items-stretch gap-2 min-w-[500px]">
          {/* 1. redisObject (16 bytes) */}
          <div className="flex-1 p-2.5 rounded-lg border border-slate-700 bg-slate-900/90 flex flex-col justify-between">
            <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span>redisObject</span>
              <span className="text-[10px] font-mono text-slate-500">16 Bytes</span>
            </div>
            <div className="space-y-1 my-2 font-mono text-[10px] text-slate-400">
              <div>type: OBJ_STRING (4b)</div>
              <div>encoding: {structure.encoding.toUpperCase()} (4b)</div>
              <div>lru/lfu: clock (24b)</div>
              <div>refcount: 1 (4B)</div>
            </div>
            <div className="pt-1.5 border-t border-slate-800 text-[10px] font-mono text-sky-400">
              {structure.encoding === 'int' ? 'ptr = (long) ' + structure.numericValue : 'ptr ➔ SDS struct'}
            </div>
          </div>

          {/* Connection arrow if raw */}
          {!structure.contiguousWithRobj && (
            <div className="flex items-center justify-center px-1 text-slate-600">
              <ArrowRight className="w-5 h-5 animate-pulse" />
            </div>
          )}

          {/* 2. SDS Struct Header & Buffer */}
          {structure.encoding !== 'int' && (
            <div className="flex-[2] p-2.5 rounded-lg border border-sky-900/60 bg-sky-950/20 flex flex-col justify-between">
              <div className="text-[11px] font-bold text-sky-300 flex items-center justify-between">
                <span>{structure.sdsType} (Simple Dynamic String)</span>
                <span className="text-[10px] font-mono text-sky-500">
                  {structure.contiguousWithRobj ? 'Single allocation' : 'Separate chunk'}
                </span>
              </div>

              {/* SDS Fields */}
              <div className="grid grid-cols-3 gap-2 my-2 font-mono text-[11px]">
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-500">len</div>
                  <div className="font-bold text-slate-200">{structure.sdsLen} B</div>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-500">alloc</div>
                  <div className="font-bold text-slate-200">{structure.sdsAlloc} B</div>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-500">flags</div>
                  <div className="font-bold text-slate-200">{structure.sdsType}</div>
                </div>
              </div>

              {/* Character buffer boxes */}
              <div className="space-y-1">
                <div className="text-[10px] text-slate-500 font-mono">buf[] Byte Array:</div>
                <div className="flex flex-wrap gap-1">
                  {chars.slice(0, 32).map((c, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded flex items-center justify-center font-mono text-xs bg-slate-900 border border-slate-700 text-slate-200 hover:border-sky-400 transition-colors"
                      title={`Index: ${i}, Char: '${c}', ASCII: ${c.charCodeAt(0)}`}
                    >
                      {c}
                    </div>
                  ))}
                  {chars.length > 32 && (
                    <div className="px-1.5 h-6 rounded flex items-center text-[10px] text-slate-500">
                      +{chars.length - 32} more
                    </div>
                  )}
                  {/* Null terminator */}
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center font-mono text-[10px] bg-red-950/40 border border-red-800/60 text-red-400 font-bold"
                    title="C-compatible null terminator \0"
                  >
                    \0
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
