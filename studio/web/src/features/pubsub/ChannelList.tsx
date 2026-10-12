import React, { useState } from 'react';
import { Radio, Search, RefreshCw, Hash, Users, Sparkles, Send } from 'lucide-react';
import { PubSubChannelItem } from './types';

interface ChannelListProps {
  channels: PubSubChannelItem[];
  totalChannels: number;
  patternCount: number;
  loading: boolean;
  onRefresh: () => void;
  onSelectChannel: (channelName: string) => void;
  onQuickSubscribe: (channelName: string) => void;
}

export const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  totalChannels,
  patternCount,
  loading,
  onRefresh,
  onSelectChannel,
  onQuickSubscribe,
}) => {
  const [query, setQuery] = useState('');

  const filtered = channels.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase().trim())
  );

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-red-500" />
          <h2 className="text-xs font-bold text-slate-200">Active Channels</h2>
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {totalChannels}
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-colors"
          title="Refresh Channel List"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Summary Bar */}
      <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span>Channels: {totalChannels}</span>
        <span>Patterns (NUMPAT): {patternCount}</span>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-slate-800">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Search channels..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-red-500 font-mono"
          />
        </div>
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {query ? 'No matching channels.' : 'No active pub/sub channels detected.'}
          </div>
        ) : (
          filtered.map((ch) => (
            <div
              key={ch.name}
              className="group px-3 py-2 hover:bg-slate-800/60 flex items-center justify-between transition-colors"
            >
              <div
                onClick={() => onSelectChannel(ch.name)}
                className="flex items-center gap-2 cursor-pointer flex-1 min-w-0 pr-2"
              >
                <Hash className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-xs font-mono text-slate-200 truncate" title={ch.name}>
                  {ch.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[10px] font-mono text-slate-300">
                  <Users className="w-2.5 h-2.5 text-slate-400" />
                  {ch.subscribers}
                </span>
                <button
                  onClick={() => onQuickSubscribe(ch.name)}
                  title="Subscribe to channel"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-600 hover:text-white text-slate-400 transition-all text-[10px] font-semibold flex items-center gap-0.5"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Sub
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
