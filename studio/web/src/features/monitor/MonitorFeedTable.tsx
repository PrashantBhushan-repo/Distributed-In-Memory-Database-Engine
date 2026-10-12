import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, Copy, Check, Terminal, ExternalLink } from 'lucide-react';
import { MonitorEntry } from './types';

interface MonitorFeedTableProps {
  entries: MonitorEntry[];
  isPinnedToBottom: boolean;
  onTogglePinned: (pinned: boolean) => void;
}

export const MonitorFeedTable: React.FC<MonitorFeedTableProps> = ({
  entries,
  isPinnedToBottom,
  onTogglePinned,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [selectedEntry, setSelectedEntry] = useState<MonitorEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const prevCountRef = useRef(entries.length);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 15,
  });

  // Auto-scroll to bottom if pinned
  useEffect(() => {
    if (isPinnedToBottom && parentRef.current && entries.length > 0) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, [entries.length, isPinnedToBottom]);

  // Handle scroll to detect if user manually scrolled up
  const handleScroll = () => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (isAtBottom) {
      setUserScrolledUp(false);
      if (!isPinnedToBottom) onTogglePinned(true);
    } else {
      setUserScrolledUp(true);
      if (isPinnedToBottom) onTogglePinned(false);
    }
  };

  const handleJumpToLatest = () => {
    setUserScrolledUp(false);
    onTogglePinned(true);
    if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  };

  const handleCopyRaw = (e: React.MouseEvent, entry: MonitorEntry) => {
    e.stopPropagation();
    navigator.clipboard.writeText(entry.raw);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getVerbBadgeColor = (cmd: string) => {
    const c = cmd.toUpperCase();
    if (['GET', 'MGET', 'HGET', 'HGETALL', 'LRANGE', 'SMEMBERS', 'ZRANGE'].includes(c)) {
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    }
    if (['SET', 'MSET', 'HSET', 'LPUSH', 'RPUSH', 'SADD', 'ZADD'].includes(c)) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    if (['DEL', 'UNLINK', 'FLUSHDB', 'FLUSHALL'].includes(c)) {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    }
    if (['INCR', 'DECR', 'EXPIRE', 'PERSIST', 'TTL'].includes(c)) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="relative flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 select-none uppercase tracking-wider">
        <div className="col-span-2">Timestamp</div>
        <div className="col-span-2">Client IP</div>
        <div className="col-span-1 text-center">DB</div>
        <div className="col-span-2">Command</div>
        <div className="col-span-5">Arguments</div>
      </div>

      {/* Virtualized Rows List */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-slate-800/40 font-mono text-xs"
      >
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Terminal className="w-8 h-8 mb-2 text-slate-600" />
            <p className="text-xs">Awaiting Redis commands stream...</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Events processed by the Redis reactor will stream here in real-time.
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = entries[virtualRow.index];
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`grid grid-cols-12 gap-2 items-center px-4 hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    selectedEntry?.id === entry.id ? 'bg-slate-800/80 border-l-2 border-red-500' : ''
                  }`}
                >
                  <div className="col-span-2 text-slate-400 text-[11px] truncate">
                    {entry.timeStr}
                  </div>
                  <div className="col-span-2 text-slate-400 text-[11px] truncate" title={entry.client}>
                    {entry.client}
                  </div>
                  <div className="col-span-1 text-center text-slate-500 text-[11px]">
                    {entry.db}
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getVerbBadgeColor(
                        entry.command
                      )}`}
                    >
                      {entry.command}
                    </span>
                  </div>
                  <div className="col-span-5 flex items-center justify-between text-slate-200 text-[11px] truncate">
                    <span className="truncate" title={entry.args.join(' ')}>
                      {entry.args.length > 0 ? entry.args.join(' ') : '—'}
                    </span>
                    <button
                      onClick={(e) => handleCopyRaw(e, entry)}
                      title="Copy raw command"
                      className="opacity-0 group-hover:opacity-100 hover:text-slate-100 p-1 text-slate-500 transition-opacity ml-2"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating "Jump to Latest" Button when scrolled up */}
      {userScrolledUp && entries.length > 0 && (
        <button
          onClick={handleJumpToLatest}
          className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-950/50 transition-transform active:scale-95"
        >
          <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
          Jump to latest
        </button>
      )}

      {/* Selected Entry Detail Drawer / Popover */}
      {selectedEntry && (
        <div className="border-t border-slate-800 bg-slate-950 p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Command Details</span>
              <span className="text-[11px] text-slate-500">[{selectedEntry.timeStr}]</span>
              <span className="text-[11px] text-slate-400">Client: {selectedEntry.client}</span>
              <span className="text-[11px] text-slate-400">DB: {selectedEntry.db}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => handleCopyRaw(e, selectedEntry)}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                {copiedId === selectedEntry.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy Raw
                  </>
                )}
              </button>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-[11px] text-slate-500 hover:text-slate-300 px-1"
              >
                ✕ Close
              </button>
            </div>
          </div>
          <div className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-slate-100 overflow-x-auto whitespace-pre-wrap break-all">
            {selectedEntry.raw}
          </div>
        </div>
      )}
    </div>
  );
};
