import React, { useState } from 'react';
import {
  Check,
  Copy,
  AlertCircle,
  Lightbulb,
  Clock,
  ChevronDown,
  ChevronRight,
  Layers,
  Table as TableIcon,
  List as ListIcon,
  Code2,
} from 'lucide-react';
import { ConsoleEntry, PipelineSubReply } from './types';
import { getErrorHint, isFlatKvArray, formatKvTable } from './commandUtils';

interface OutputBlockProps {
  entry: ConsoleEntry;
  onCommandClick?: (cmdName: string) => void;
  onRunExample?: (cmd: string) => void;
}

export const OutputBlock: React.FC<OutputBlockProps> = ({ entry, onCommandClick }) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedRes, setCopiedRes] = useState(false);
  const [showAllArray, setShowAllArray] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [viewJsonPretty, setViewJsonPretty] = useState(false);

  const commandTokens = entry.command.trim().split(/\s+/);
  const mainCmdName = commandTokens[0]?.toUpperCase() || '';

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(entry.command);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  };

  const handleCopyResult = () => {
    let text = '';
    if (entry.error) {
      text = `(error) ${entry.error}`;
    } else if (entry.isPipeline && entry.pipelineReplies) {
      text = entry.pipelineReplies
        .map((r, i) => `${i + 1}) ${r.command} -> ${JSON.stringify(r.reply)}`)
        .join('\n');
    } else if (entry.reply === null || entry.reply === undefined) {
      text = '(nil)';
    } else if (typeof entry.reply === 'object') {
      text = JSON.stringify(entry.reply, null, 2);
    } else {
      text = String(entry.reply);
    }
    navigator.clipboard.writeText(text);
    setCopiedRes(true);
    setTimeout(() => setCopiedRes(false), 1500);
  };

  const errorHint = entry.hint || (entry.error ? getErrorHint(entry.error) : undefined);

  // Check if string is JSON
  let isJsonString = false;
  let parsedJson: any = null;
  if (typeof entry.reply === 'string' && entry.reply.length > 2) {
    const trimmed = entry.reply.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        parsedJson = JSON.parse(trimmed);
        isJsonString = true;
      } catch {}
    }
  }

  // Check if flat KV array
  const isKv = Array.isArray(entry.reply) && isFlatKvArray(entry.reply);
  const kvRows = isKv ? formatKvTable(entry.reply) : [];

  return (
    <div className="group relative rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs font-mono transition-all hover:border-slate-700 shadow-md">
      {/* Top Header: Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-emerald-500 font-bold select-none">redis&gt;</span>
          <button
            type="button"
            onClick={() => onCommandClick?.(mainCmdName)}
            title={`Click to explain ${mainCmdName}`}
            className="font-bold text-sky-400 hover:text-sky-300 hover:underline uppercase transition"
          >
            {mainCmdName}
          </button>
          <span className="text-slate-300 select-all">
            {commandTokens.slice(1).join(' ')}
          </span>
          {entry.isPipeline && (
            <span className="inline-flex items-center gap-1 rounded bg-indigo-950/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-800/60">
              <Layers className="h-3 w-3" />
              Pipeline ({entry.pipelineReplies?.length || 0})
            </span>
          )}
        </div>

        {/* Right side badges & copy tools */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1 text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
            <Clock className="h-3 w-3 text-slate-400" />
            {entry.durationMs}ms
          </span>

          <span className="text-slate-400">{entry.timestamp}</span>

          <button
            onClick={handleCopyCommand}
            title="Copy command"
            className="flex items-center gap-1 rounded p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            {copiedCmd ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={handleCopyResult}
            title="Copy reply"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[10px]"
          >
            {copiedRes ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy Result
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reply Body */}
      <div className="pt-3">
        {/* Error State */}
        {entry.error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-red-300">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold text-red-400">(error) </span>
                <span className="select-all">{entry.error}</span>
              </div>
            </div>

            {errorHint && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-2.5 text-amber-200/90 text-[11px]">
                <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-300">Hint: </span>
                  {errorHint}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pipeline Output */}
        {!entry.error && entry.isPipeline && entry.pipelineReplies && (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Pipeline execution ({entry.pipelineReplies.length} replies):</span>
            </div>
            <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
              {entry.pipelineReplies.map((sub, idx) => (
                <div key={idx} className="p-2.5 hover:bg-slate-900/50 transition">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="flex items-center gap-1.5 font-bold text-slate-300">
                      <span className="text-slate-400">{idx + 1})</span>
                      <span className="text-sky-400">{sub.command}</span>
                    </span>
                    <span className="text-[10px] text-slate-400">{sub.durationMs}ms</span>
                  </div>
                  {sub.error ? (
                    <div className="text-red-400 pl-4">(error) {sub.error}</div>
                  ) : sub.reply === null ? (
                    <div className="text-slate-400 italic pl-4">(nil)</div>
                  ) : typeof sub.reply === 'number' ? (
                    <div className="text-cyan-400 pl-4">(integer) {sub.reply}</div>
                  ) : Array.isArray(sub.reply) ? (
                    <div className="pl-4 space-y-0.5 text-slate-300">
                      {sub.reply.slice(0, 10).map((itm, i) => (
                        <div key={i} className="truncate">
                          <span className="text-slate-400">{i + 1})</span> "{String(itm)}"
                        </div>
                      ))}
                      {sub.reply.length > 10 && (
                        <div className="text-slate-400 italic text-[10px]">
                          ... {sub.reply.length - 10} more items
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-emerald-400 pl-4 select-all">
                      {typeof sub.reply === 'object' ? JSON.stringify(sub.reply) : String(sub.reply)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single Command Output */}
        {!entry.error && !entry.isPipeline && (
          <div>
            {/* 1. NIL */}
            {entry.reply === null && (
              <span className="text-slate-400 italic font-mono select-all text-[13px]">(nil)</span>
            )}

            {/* 2. Integer */}
            {typeof entry.reply === 'number' && (
              <div className="flex items-center gap-2 text-cyan-400 text-[13px]">
                <span className="text-slate-400 select-none">(integer)</span>
                <span className="font-bold select-all">{entry.reply}</span>
              </div>
            )}

            {/* 3. Status (like OK, PONG) */}
            {entry.kind === 'status' && (
              <span className="text-emerald-400 font-bold text-[13px] select-all">
                {String(entry.reply)}
              </span>
            )}

            {/* 4. Table Rendering for Flat Key/Value Arrays (HGETALL, CONFIG GET) */}
            {isKv && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <TableIcon className="h-3.5 w-3.5 text-sky-400" />
                    <span>Key-Value Map ({kvRows.length} pairs)</span>
                  </div>
                  {kvRows.length > 6 && (
                    <input
                      type="text"
                      placeholder="Filter fields..."
                      value={tableFilter}
                      onChange={(e) => setTableFilter(e.target.value)}
                      className="rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] text-slate-400">
                        <th className="py-1.5 px-3 w-12 text-slate-400">#</th>
                        <th className="py-1.5 px-3 font-semibold text-slate-300">Field / Parameter</th>
                        <th className="py-1.5 px-3 font-semibold text-slate-300">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {kvRows
                        .filter(
                          (r) =>
                            !tableFilter ||
                            r.field.toLowerCase().includes(tableFilter.toLowerCase()) ||
                            r.value.toLowerCase().includes(tableFilter.toLowerCase())
                        )
                        .map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50 transition">
                            <td className="py-1.5 px-3 text-slate-400 select-none text-[11px]">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-semibold text-sky-300 select-all">{row.field}</td>
                            <td className="py-1.5 px-3 text-emerald-300 select-all font-mono break-all">{row.value}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. Generic Array (Numbered List with Truncation) */}
            {Array.isArray(entry.reply) && !isKv && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <ListIcon className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Array elements ({entry.reply.length} items)</span>
                  </div>
                  {entry.reply.length > 50 && (
                    <button
                      onClick={() => setShowAllArray(!showAllArray)}
                      className="text-sky-400 hover:text-sky-300 text-[11px] font-semibold underline"
                    >
                      {showAllArray ? 'Collapse to 50' : `Show all ${entry.reply.length} items`}
                    </button>
                  )}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-[400px] overflow-y-auto">
                  {(showAllArray ? entry.reply : entry.reply.slice(0, 50)).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-slate-200">
                      <span className="text-slate-400 select-none w-8 text-right shrink-0">{idx + 1})</span>
                      <span className="select-all font-mono">
                        {typeof item === 'object' ? JSON.stringify(item) : `"${String(item)}"`}
                      </span>
                    </div>
                  ))}
                  {!showAllArray && entry.reply.length > 50 && (
                    <div className="pt-2 text-slate-400 italic text-center border-t border-slate-800/80">
                      Showing 50 of {entry.reply.length} items. Click "Show all" above to view full list.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. String / Object Value (with JSON Toggle if applicable) */}
            {typeof entry.reply === 'string' && entry.kind !== 'status' && (
              <div className="space-y-2">
                {isJsonString && (
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => setViewJsonPretty(!viewJsonPretty)}
                      className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold bg-amber-950/40 border border-amber-850 px-2 py-0.5 rounded"
                    >
                      <Code2 className="h-3 w-3" />
                      {viewJsonPretty ? 'Raw String' : 'Pretty JSON'}
                    </button>
                  </div>
                )}
                <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 overflow-x-auto">
                  <pre className="text-emerald-300 font-mono text-[12px] leading-relaxed whitespace-pre-wrap select-all">
                    {viewJsonPretty && parsedJson ? JSON.stringify(parsedJson, null, 2) : entry.reply}
                  </pre>
                </div>
              </div>
            )}

            {/* 7. Fallback Object */}
            {typeof entry.reply === 'object' && entry.reply !== null && !Array.isArray(entry.reply) && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 overflow-x-auto">
                <pre className="text-sky-300 font-mono text-[12px] leading-relaxed whitespace-pre-wrap select-all">
                  {JSON.stringify(entry.reply, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
