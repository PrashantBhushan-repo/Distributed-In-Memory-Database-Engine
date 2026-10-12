import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  Layers,
  ArrowUpDown,
  Search,
  Sparkles,
  Sliders,
  Trash2,
  HelpCircle,
  Zap,
  Info,
} from 'lucide-react';
import { SlowLogEntry, SlowLogGroupedEntry, SlowLogCauseHint } from './types';
import { InfoTip } from '../../components/InfoTip';

interface SlowLogTableProps {
  entries: SlowLogEntry[];
  thresholdUs: number;
  totalLen: number;
  onOpenThresholdConfig: () => void;
  onResetSlowLog: () => void;
  onExplainCause: (hint: SlowLogCauseHint) => void;
}

export const SlowLogTable: React.FC<SlowLogTableProps> = ({
  entries,
  thresholdUs,
  totalLen,
  onOpenThresholdConfig,
  onResetSlowLog,
  onExplainCause,
}) => {
  const [groupByCommand, setGroupByCommand] = useState(false);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'duration' | 'timestamp' | 'id'>('duration');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter individual entries
  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.command.toLowerCase().includes(q) ||
        e.clientAddr.toLowerCase().includes(q) ||
        e.clientName.toLowerCase().includes(q) ||
        String(e.id).includes(q)
    );
  }, [entries, search]);

  // Group by command
  const groupedList = useMemo<SlowLogGroupedEntry[]>(() => {
    const groups: Map<string, SlowLogEntry[]> = new Map();

    filteredEntries.forEach((entry) => {
      const verb = entry.command.trim().split(/\s+/)[0]?.toUpperCase() || 'UNKNOWN';
      const list = groups.get(verb) || [];
      list.push(entry);
      groups.set(verb, list);
    });

    const result: SlowLogGroupedEntry[] = [];
    groups.forEach((samples, cmd) => {
      const totalUs = samples.reduce((acc, s) => acc + s.durationUs, 0);
      const maxUs = Math.max(...samples.map((s) => s.durationUs));
      const avgUs = Math.round(totalUs / samples.length);

      result.push({
        command: cmd,
        count: samples.length,
        avgDurationUs: avgUs,
        avgDurationMs: Math.round(avgUs / 10) / 100,
        maxDurationUs: maxUs,
        maxDurationMs: Math.round(maxUs / 10) / 100,
        totalDurationMs: Math.round(totalUs / 10) / 100,
        causeHint: samples.find((s) => s.causeHint)?.causeHint,
        samples,
      });
    });

    // Default sort grouped by count desc
    return result.sort((a, b) => b.count - a.count);
  }, [filteredEntries]);

  // Sorted individual entries
  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      if (sortField === 'duration') {
        return sortAsc ? a.durationUs - b.durationUs : b.durationUs - a.durationUs;
      }
      if (sortField === 'timestamp') {
        return sortAsc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
      }
      return sortAsc ? a.id - b.id : b.id - a.id;
    });
  }, [filteredEntries, sortField, sortAsc]);

  const handleSortToggle = (field: 'duration' | 'timestamp' | 'id') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3.5">
      {/* Top Banner & Threshold Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        {/* Left: Title & Threshold */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Clock className="h-4 w-4 text-amber-400" />
            <span>Slow Log Inspector</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px]">
            <span className="text-slate-400">Capture Threshold:</span>
            <span className="font-mono font-bold text-emerald-400">
              {thresholdUs.toLocaleString()} µs ({Math.round(thresholdUs / 1000)} ms)
            </span>
            <InfoTip content="Commands with execution latency greater than slowlog-log-slower-than are recorded into memory." />
            <button
              type="button"
              onClick={onOpenThresholdConfig}
              className="ml-1 text-sky-400 hover:text-sky-300 font-semibold underline text-[10px]"
            >
              Change
            </button>
          </div>

          <span className="text-slate-400 text-[11px]">
            Circular buffer entries: <strong className="text-white font-mono">{totalLen}</strong>
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle Group by Command */}
          <button
            type="button"
            onClick={() => setGroupByCommand(!groupByCommand)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              groupByCommand
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Group by Command</span>
          </button>

          <button
            type="button"
            onClick={onResetSlowLog}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-red-950/40 hover:text-red-300 hover:border-red-800/60 px-2.5 py-1 text-[11px] text-slate-400 transition"
          >
            <Trash2 className="h-3 w-3" />
            <span>Reset Log</span>
          </button>
        </div>
      </div>

      {/* Filter search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search command, client address, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-slate-900 border border-slate-700 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-sky-500 focus:outline-none"
        />
      </div>

      {/* Empty State */}
      {entries.length === 0 ? (
        <div className="p-8 text-center space-y-3 rounded-lg border border-slate-850 bg-slate-950/60 my-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Nothing slow — good news!</h4>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">
              All commands processed recently executed below the current threshold of{' '}
              <strong className="text-emerald-400 font-mono">{thresholdUs.toLocaleString()} µs ({Math.round(thresholdUs / 1000)} ms)</strong>.
            </p>
          </div>
        </div>
      ) : groupByCommand ? (
        /* Grouped by Command View */
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] text-slate-400 font-sans">
                <th className="py-2 px-3 font-semibold text-slate-300">Command</th>
                <th className="py-2 px-3 font-semibold text-slate-300 text-center w-24">Frequency</th>
                <th className="py-2 px-3 font-semibold text-slate-300 text-right w-28">Avg Latency</th>
                <th className="py-2 px-3 font-semibold text-slate-300 text-right w-28">Max Latency</th>
                <th className="py-2 px-3 font-semibold text-slate-300 text-right w-32">Total Delay</th>
                <th className="py-2 px-3 font-semibold text-slate-300 w-44">Root Cause Hint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {groupedList.map((g) => (
                <tr key={g.command} className="hover:bg-slate-900/50 transition">
                  <td className="py-2.5 px-3 font-bold text-sky-400 text-[13px]">
                    {g.command}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-white font-bold">
                      {g.count}×
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                    {g.avgDurationMs} ms
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-rose-400">
                    {g.maxDurationMs} ms
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {g.totalDurationMs} ms
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    {g.causeHint ? (
                      <button
                        type="button"
                        onClick={() => onExplainCause(g.causeHint!)}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold border transition ${
                          g.causeHint.severity === 'critical'
                            ? 'bg-red-950/80 text-red-300 border-red-800/80 hover:bg-red-900'
                            : 'bg-amber-950/80 text-amber-300 border-amber-800/80 hover:bg-amber-900'
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        <span>Why slow? Explain</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Unclassified</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Individual Entries Table */
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] text-slate-400 font-sans select-none">
                <th
                  onClick={() => handleSortToggle('id')}
                  className="py-2 px-3 w-14 cursor-pointer hover:text-white font-semibold"
                >
                  <div className="flex items-center gap-1">
                    <span>#</span>
                    {sortField === 'id' && <ArrowUpDown className="h-3 w-3 text-sky-400" />}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle('duration')}
                  className="py-2 px-3 w-32 cursor-pointer hover:text-white font-semibold text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Duration</span>
                    {sortField === 'duration' && <ArrowUpDown className="h-3 w-3 text-sky-400" />}
                  </div>
                </th>
                <th className="py-2 px-3 font-semibold text-slate-300">Command &amp; Arguments</th>
                <th className="py-2 px-3 font-semibold text-slate-300 w-44">Client Socket</th>
                <th
                  onClick={() => handleSortToggle('timestamp')}
                  className="py-2 px-3 w-36 cursor-pointer hover:text-white font-semibold text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Timestamp</span>
                    {sortField === 'timestamp' && <ArrowUpDown className="h-3 w-3 text-sky-400" />}
                  </div>
                </th>
                <th className="py-2 px-3 font-semibold text-slate-300 w-36 text-center">Diagnostic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {sortedEntries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-900/50 transition">
                  {/* ID */}
                  <td className="py-2 px-3 text-slate-400 text-[11px]">{e.id}</td>

                  {/* Duration */}
                  <td className="py-2 px-3 text-right">
                    <span
                      className={`font-bold ${
                        e.durationMs > 100
                          ? 'text-rose-400'
                          : e.durationMs > 20
                          ? 'text-amber-400'
                          : 'text-sky-300'
                      }`}
                    >
                      {e.durationMs} ms
                    </span>
                    <span className="block text-[9px] text-slate-400">
                      ({e.durationUs.toLocaleString()} µs)
                    </span>
                  </td>

                  {/* Command & Args */}
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 select-all">
                      <span className="font-bold text-sky-400 uppercase">
                        {e.command.split(/\s+/)[0]}
                      </span>
                      <span className="text-slate-300 truncate max-w-md">
                        {e.command.split(/\s+/).slice(1).join(' ')}
                      </span>
                    </div>
                  </td>

                  {/* Client */}
                  <td className="py-2 px-3 font-sans">
                    <div className="truncate max-w-[170px]" title={e.clientAddr}>
                      <span className="font-mono text-slate-300 text-[11px] block">{e.clientAddr}</span>
                      {e.clientName && (
                        <span className="text-slate-400 text-[10px] block">({e.clientName})</span>
                      )}
                    </div>
                  </td>

                  {/* Timestamp */}
                  <td className="py-2 px-3 text-right text-slate-400 text-[11px]">
                    {new Date(e.timestamp * 1000).toLocaleTimeString()}
                  </td>

                  {/* Cause Hint Chip */}
                  <td className="py-2 px-3 text-center font-sans">
                    {e.causeHint ? (
                      <button
                        type="button"
                        onClick={() => onExplainCause(e.causeHint!)}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold border transition ${
                          e.causeHint.severity === 'critical'
                            ? 'bg-red-950/80 text-red-300 border-red-800 hover:bg-red-900'
                            : 'bg-amber-950/80 text-amber-300 border-amber-800 hover:bg-amber-900'
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        <span>Explain</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[10px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
