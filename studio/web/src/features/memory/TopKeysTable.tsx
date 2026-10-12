import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, ArrowUpRight, Clock, HardDrive } from 'lucide-react';
import { TopKey } from './types';

interface TopKeysTableProps {
  topKeys: TopKey[];
  sampledKeys: number;
}

export const TopKeysTable: React.FC<TopKeysTableProps> = ({ topKeys, sampledKeys }) => {
  const navigate = useNavigate();

  const middleEllipsis = (str: string, maxLen = 36) => {
    if (str.length <= maxLen) return str;
    const half = Math.floor((maxLen - 3) / 2);
    return `${str.substring(0, half)}...${str.substring(str.length - half)}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const formatTtl = (ttl: number) => {
    if (ttl === -1) return <span className="text-slate-400">persist</span>;
    if (ttl <= 60) return <span className="text-rose-400 font-bold">{ttl}s</span>;
    if (ttl <= 3600) return <span className="text-amber-400">{Math.round(ttl / 60)}m</span>;
    if (ttl <= 86400) return <span className="text-sky-400">{Math.round(ttl / 3600)}h</span>;
    return <span className="text-emerald-400">{Math.round(ttl / 86400)}d</span>;
  };

  const getTypeBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case 'string':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-850';
      case 'hash':
        return 'bg-amber-950/80 text-amber-400 border-amber-850';
      case 'list':
        return 'bg-cyan-950/80 text-cyan-400 border-cyan-850';
      case 'set':
        return 'bg-purple-950/80 text-purple-400 border-purple-850';
      case 'zset':
        return 'bg-rose-950/80 text-rose-400 border-rose-850';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-slate-200">Top 20 Memory Consumers</span>
          <span className="text-slate-400 text-[11px]">
            (Sampled across {sampledKeys.toLocaleString()} keys)
          </span>
        </div>
        <span className="text-[11px] text-slate-400">Click any key to inspect in Key Explorer</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] text-slate-400">
              <th className="py-2 px-3 w-10 text-slate-400">#</th>
              <th className="py-2 px-3 font-semibold text-slate-300">Key Name</th>
              <th className="py-2 px-3 font-semibold text-slate-300 w-24">Type</th>
              <th className="py-2 px-3 font-semibold text-slate-300 w-28 text-right">Memory Size</th>
              <th className="py-2 px-3 font-semibold text-slate-300 w-24 text-center">TTL</th>
              <th className="py-2 px-3 w-12 text-center">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {topKeys.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No keys found in current database.
                </td>
              </tr>
            ) : (
              topKeys.map((key, idx) => (
                <tr
                  key={key.name}
                  onClick={() => navigate(`/keys?key=${encodeURIComponent(key.name)}`)}
                  className="hover:bg-slate-900/60 cursor-pointer transition group"
                >
                  <td className="py-2 px-3 text-slate-400 select-none font-mono text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-2 px-3 font-mono font-medium text-slate-200 group-hover:text-sky-300 transition">
                    <span title={key.name}>{middleEllipsis(key.name)}</span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase border ${getTypeBadge(
                        key.type
                      )}`}
                    >
                      {key.type}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-emerald-400 text-right">
                    {formatBytes(key.memoryBytes)}
                  </td>
                  <td className="py-2 px-3 font-mono text-center text-[11px]">
                    {formatTtl(key.ttl)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      title="Open in Key Explorer"
                      className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
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
