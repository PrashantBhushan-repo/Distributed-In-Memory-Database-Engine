import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ArrowUpRight, Plus, Sparkles, AlertCircle } from 'lucide-react';
import { ExpiringKey } from './types';

interface SoonestExpiringListProps {
  keys: ExpiringKey[];
  totalWithTtl: number;
  totalSampled: number;
  onOpenBulkSet: () => void;
}

export const SoonestExpiringList: React.FC<SoonestExpiringListProps> = ({
  keys,
  totalWithTtl,
  totalSampled,
  onOpenBulkSet,
}) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());

  // Ticking countdown interval every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (expiresAtStr: string) => {
    const diffMs = new Date(expiresAtStr).getTime() - now;
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec === 0) return <span className="text-red-400 font-bold">Expired</span>;
    if (diffSec <= 60) return <span className="text-rose-400 font-bold">{diffSec}s</span>;
    if (diffSec < 3600) {
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      return <span className="text-amber-400">{m}m {s}s</span>;
    }
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    return <span className="text-sky-400">{h}h {m}m</span>;
  };

  const middleEllipsis = (str: string, maxLen = 32) => {
    if (str.length <= maxLen) return str;
    const half = Math.floor((maxLen - 3) / 2);
    return `${str.substring(0, half)}...${str.substring(str.length - half)}`;
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-400" />
          <span className="font-semibold text-slate-200">Soonest Expiring Keys (Live Countdown)</span>
          <span className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {totalWithTtl.toLocaleString()} keys with TTL active
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenBulkSet}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-1 font-semibold text-white shadow-sm transition text-[11px]"
        >
          <Plus className="h-3 w-3" /> Bulk Set TTL
        </button>
      </div>

      {/* List / Table */}
      {keys.length === 0 ? (
        <div className="p-8 text-center space-y-3 rounded-lg border border-slate-850 bg-slate-950/60 my-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-slate-400">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-200">No keys have a TTL configured</h4>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">
              All keys in this database are persistent (TTL = -1). Keys will remain in memory until explicitly deleted or evicted.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenBulkSet}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs text-sky-300 font-semibold transition"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Bulk Configure Key Expirations
          </button>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] text-slate-400">
                <th className="py-2 px-3 w-10 text-slate-400">#</th>
                <th className="py-2 px-3 font-semibold text-slate-300">Key Name</th>
                <th className="py-2 px-3 font-semibold text-slate-300 w-24">Type</th>
                <th className="py-2 px-3 font-semibold text-slate-300 w-32 text-right">Remaining Time</th>
                <th className="py-2 px-3 font-semibold text-slate-300 w-44 text-right">Expiration Timestamp</th>
                <th className="py-2 px-3 w-12 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {keys.map((k, idx) => (
                <tr
                  key={k.name}
                  onClick={() => navigate(`/keys?key=${encodeURIComponent(k.name)}`)}
                  className="hover:bg-slate-900/60 cursor-pointer transition group"
                >
                  <td className="py-2 px-3 text-slate-400 font-mono text-[11px] select-none">
                    {idx + 1}
                  </td>
                  <td className="py-2 px-3 font-mono font-medium text-slate-200 group-hover:text-sky-300 transition">
                    <span title={k.name}>{middleEllipsis(k.name)}</span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase border ${getTypeBadge(
                        k.type
                      )}`}
                    >
                      {k.type}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-right font-bold text-[12px]">
                    {formatCountdown(k.expiresAt)}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-400 text-right text-[11px]">
                    {new Date(k.expiresAt).toLocaleTimeString()}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      title="Inspect in Key Explorer"
                      className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
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
