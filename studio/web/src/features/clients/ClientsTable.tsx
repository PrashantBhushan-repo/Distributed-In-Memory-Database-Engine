import React, { useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Tag,
  Trash2,
  AlertTriangle,
  Radio,
  ShieldAlert,
  Play,
  Pause,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { ClientInfo } from './types';

interface ClientsTableProps {
  clients: ClientInfo[];
  isAutoRefreshActive: boolean;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
  onKillClient: (client: ClientInfo) => void;
  onRenameClient: (client: ClientInfo) => void;
}

export const ClientsTable: React.FC<ClientsTableProps> = ({
  clients,
  isAutoRefreshActive,
  onToggleAutoRefresh,
  onManualRefresh,
  onKillClient,
  onRenameClient,
}) => {
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState<'all' | 'blocked' | 'subscribed' | 'high_buffer' | 'high_idle'>('all');
  const [sortField, setSortField] = useState<'idle' | 'age' | 'omem' | 'id'>('idle');
  const [sortAsc, setSortAsc] = useState(false);

  const formatSeconds = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter((c) => {
      // Search filter
      if (
        q &&
        !c.addr.toLowerCase().includes(q) &&
        !c.name.toLowerCase().includes(q) &&
        !c.cmd.toLowerCase().includes(q) &&
        !c.id.includes(q)
      ) {
        return false;
      }

      // Flag filter
      if (flagFilter === 'blocked' && !c.isBlocked) return false;
      if (flagFilter === 'subscribed' && !c.isSubscribed) return false;
      if (flagFilter === 'high_buffer' && !c.isHighBuffer) return false;
      if (flagFilter === 'high_idle' && !c.isHighIdle) return false;

      return true;
    });
  }, [clients, search, flagFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA: number = 0;
      let valB: number = 0;

      if (sortField === 'id') {
        valA = Number(a.id) || 0;
        valB = Number(b.id) || 0;
      } else if (sortField === 'idle') {
        valA = a.idle;
        valB = b.idle;
      } else if (sortField === 'age') {
        valA = a.age;
        valB = b.age;
      } else if (sortField === 'omem') {
        valA = a.omem;
        valB = b.omem;
      }

      return sortAsc ? valA - valB : valB - valA;
    });
  }, [filtered, sortField, sortAsc]);

  const handleSortToggle = (field: 'idle' | 'age' | 'omem' | 'id') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default desc
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Filter clients by address, name, ID, or command..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-sky-500 focus:outline-none"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'blocked', label: 'Blocked' },
              { id: 'subscribed', label: 'Subscribed' },
              { id: 'high_buffer', label: 'High Buffer' },
              { id: 'high_idle', label: 'Idle > 5m' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFlagFilter(f.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                flagFilter === f.id
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Refresh controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAutoRefresh}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              isAutoRefreshActive
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {isAutoRefreshActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span>Auto (5s)</span>
          </button>

          <button
            type="button"
            onClick={onManualRefresh}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh now"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] text-slate-400 select-none">
              <th
                onClick={() => handleSortToggle('id')}
                className="py-2 px-3 w-16 cursor-pointer hover:text-white font-semibold"
              >
                <div className="flex items-center gap-1">
                  <span>ID</span>
                  {sortField === 'id' && <ArrowUpDown className="h-3 w-3 text-sky-400" />}
                </div>
              </th>
              <th className="py-2 px-3 font-semibold text-slate-300">Client / Socket</th>
              <th className="py-2 px-3 font-semibold text-slate-300 w-28">Name</th>
              <th
                onClick={() => handleSortToggle('age')}
                className="py-2 px-3 w-24 cursor-pointer hover:text-white font-semibold"
              >
                <div className="flex items-center gap-1">
                  <span>Age</span>
                  {sortField === 'age' && <ArrowUpDown className="h-3 w-3 text-sky-400" />}
                </div>
              </th>
              <th
                onClick={() => handleSortToggle('idle')}
                className="py-2 px-3 w-24 cursor-pointer hover:text-white font-semibold"
              >
                <div className="flex items-center gap-1">
                  <span>Idle</span>
                  {sortField === 'idle' && <ArrowUpDown className="h-3 w-3 text-sky-400" />}
                </div>
              </th>
              <th className="py-2 px-3 w-16 text-center font-semibold">DB</th>
              <th className="py-2 px-3 w-28 font-semibold">Last Cmd</th>
              <th
                onClick={() => handleSortToggle('omem')}
                className="py-2 px-3 w-28 text-right cursor-pointer hover:text-white font-semibold"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Out Buffer</span>
                  {sortField === 'omem' && <ArrowUpDown className="h-3 w-3 text-sky-400" />}
                </div>
              </th>
              <th className="py-2 px-3 w-28 text-center font-semibold">Flags</th>
              <th className="py-2 px-3 w-20 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400">
                  No active clients match the current filter.
                </td>
              </tr>
            ) : (
              sorted.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-slate-900/50 transition font-mono ${
                    c.isHighBuffer ? 'bg-rose-950/10' : c.isHighIdle ? 'bg-amber-950/5' : ''
                  }`}
                >
                  {/* ID */}
                  <td className="py-2 px-3 text-slate-400 text-[11px]">{c.id}</td>

                  {/* Addr */}
                  <td className="py-2 px-3 text-sky-300 font-bold select-all">
                    {c.addr}
                  </td>

                  {/* Name */}
                  <td className="py-2 px-3 text-slate-300 font-sans">
                    {c.name ? (
                      <span className="truncate max-w-[120px] block" title={c.name}>
                        {c.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">(none)</span>
                    )}
                  </td>

                  {/* Age */}
                  <td className="py-2 px-3 text-slate-300 text-[11px]">
                    {formatSeconds(c.age)}
                  </td>

                  {/* Idle with Highlight */}
                  <td className="py-2 px-3 text-[11px]">
                    <span
                      className={`font-bold ${
                        c.isHighIdle ? 'text-amber-400' : 'text-slate-300'
                      }`}
                    >
                      {formatSeconds(c.idle)}
                    </span>
                    {c.isHighIdle && (
                      <span className="ml-1 text-[9px] text-amber-400 font-sans font-bold">
                        (stale)
                      </span>
                    )}
                  </td>

                  {/* DB */}
                  <td className="py-2 px-3 text-center text-slate-400 text-[11px]">
                    db{c.db}
                  </td>

                  {/* Cmd */}
                  <td className="py-2 px-3 text-emerald-300 font-bold uppercase text-[11px]">
                    {c.cmd}
                  </td>

                  {/* Buffer with Highlight */}
                  <td className="py-2 px-3 text-right text-[11px]">
                    <span
                      className={`font-bold ${
                        c.isHighBuffer ? 'text-rose-400' : 'text-slate-300'
                      }`}
                    >
                      {formatBytes(c.omem)}
                    </span>
                    {c.obl > 0 && (
                      <span className="block text-[9px] text-rose-400">
                        obl: {formatBytes(c.obl)}
                      </span>
                    )}
                  </td>

                  {/* Badges / Flags */}
                  <td className="py-2 px-3 text-center font-sans">
                    <div className="flex items-center justify-center gap-1">
                      {c.isBlocked && (
                        <span className="rounded bg-amber-950 border border-amber-800 px-1 py-0.5 text-[9px] font-bold text-amber-300">
                          BLOCKED
                        </span>
                      )}
                      {c.isSubscribed && (
                        <span className="rounded bg-indigo-950 border border-indigo-800 px-1 py-0.5 text-[9px] font-bold text-indigo-300">
                          PUB/SUB
                        </span>
                      )}
                      {!c.isBlocked && !c.isSubscribed && (
                        <span className="rounded bg-slate-900 border border-slate-800 px-1 py-0.5 text-[9px] text-slate-400 font-mono">
                          {c.flags}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onRenameClient(c)}
                        title="Rename client"
                        className="rounded p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition"
                      >
                        <Tag className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onKillClient(c)}
                        title="Kill connection"
                        className="rounded p-1 text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
