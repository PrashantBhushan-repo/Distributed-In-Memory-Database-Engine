import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Info,
  Search,
  Zap,
  Sparkles,
  Layers,
  Database,
  Hash,
  List,
  Server,
  FolderOpen,
} from 'lucide-react';

export interface SnippetItem {
  name: string;
  template: string;
  summary: string;
}

interface GroupDefinition {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  snippets: SnippetItem[];
}

const SNIPPET_GROUPS: GroupDefinition[] = [
  {
    id: 'string',
    label: 'Strings',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    color: 'text-emerald-400',
    snippets: [
      { name: 'SET', template: 'SET key "Hello World"', summary: 'Set string value with optional TTL' },
      { name: 'GET', template: 'GET key', summary: 'Get value of string key' },
      { name: 'MSET', template: 'MSET k1 "v1" k2 "v2" k3 "v3"', summary: 'Atomically set multiple keys' },
      { name: 'MGET', template: 'MGET k1 k2 k3', summary: 'Get multiple values in one roundtrip' },
      { name: 'INCR', template: 'INCR counter', summary: 'Atomically increment integer by 1' },
      { name: 'APPEND', template: 'APPEND key " extra"', summary: 'Append string to existing value' },
      { name: 'STRLEN', template: 'STRLEN key', summary: 'Return byte length of string' },
    ],
  },
  {
    id: 'hash',
    label: 'Hashes',
    icon: <Hash className="h-3.5 w-3.5" />,
    color: 'text-amber-400',
    snippets: [
      { name: 'HSET', template: 'HSET user:1000 name "Alice" role "admin"', summary: 'Set fields on a hash' },
      { name: 'HGET', template: 'HGET user:1000 name', summary: 'Get single field value' },
      { name: 'HGETALL', template: 'HGETALL user:1000', summary: 'Get all fields and values' },
      { name: 'HDEL', template: 'HDEL user:1000 role', summary: 'Delete one or more fields' },
      { name: 'HEXISTS', template: 'HEXISTS user:1000 name', summary: 'Check if field exists in hash' },
      { name: 'HLEN', template: 'HLEN user:1000', summary: 'Get number of fields in hash' },
    ],
  },
  {
    id: 'list',
    label: 'Lists',
    icon: <List className="h-3.5 w-3.5" />,
    color: 'text-cyan-400',
    snippets: [
      { name: 'LPUSH', template: 'LPUSH tasks "job-1" "job-2"', summary: 'Prepend elements to left' },
      { name: 'RPUSH', template: 'RPUSH tasks "job-3"', summary: 'Append elements to right' },
      { name: 'LRANGE', template: 'LRANGE tasks 0 -1', summary: 'Get slice of list (0 -1 for all)' },
      { name: 'LPOP', template: 'LPOP tasks', summary: 'Pop and return first element' },
      { name: 'RPOP', template: 'RPOP tasks', summary: 'Pop and return last element' },
      { name: 'LLEN', template: 'LLEN tasks', summary: 'Get length of list' },
    ],
  },
  {
    id: 'set',
    label: 'Sets',
    icon: <Layers className="h-3.5 w-3.5" />,
    color: 'text-purple-400',
    snippets: [
      { name: 'SADD', template: 'SADD tags "database" "in-memory" "cache"', summary: 'Add members to set' },
      { name: 'SMEMBERS', template: 'SMEMBERS tags', summary: 'Get all unique set members' },
      { name: 'SISMEMBER', template: 'SISMEMBER tags "cache"', summary: 'Check set membership' },
      { name: 'SREM', template: 'SREM tags "cache"', summary: 'Remove member from set' },
      { name: 'SCARD', template: 'SCARD tags', summary: 'Get cardinality of set' },
    ],
  },
  {
    id: 'zset',
    label: 'Sorted Sets',
    icon: <Zap className="h-3.5 w-3.5" />,
    color: 'text-rose-400',
    snippets: [
      { name: 'ZADD', template: 'ZADD scores 95 "Alice" 88 "Bob" 99 "Charlie"', summary: 'Add member with score' },
      { name: 'ZRANGE', template: 'ZRANGE scores 0 -1 WITHSCORES', summary: 'Get range sorted by score' },
      { name: 'ZREVRANGE', template: 'ZREVRANGE scores 0 9 WITHSCORES', summary: 'Get top 10 highest scores' },
      { name: 'ZSCORE', template: 'ZSCORE scores "Alice"', summary: 'Get score of member' },
      { name: 'ZCARD', template: 'ZCARD scores', summary: 'Get number of elements in zset' },
    ],
  },
  {
    id: 'server',
    label: 'Server & Diagnostic',
    icon: <Server className="h-3.5 w-3.5" />,
    color: 'text-blue-400',
    snippets: [
      { name: 'INFO', template: 'INFO default', summary: 'Server stats and memory diagnostics' },
      { name: 'DBSIZE', template: 'DBSIZE', summary: 'Return total count of keys in current DB' },
      { name: 'PING', template: 'PING', summary: 'Check connection responsiveness' },
      { name: 'TIME', template: 'TIME', summary: 'Return server unix epoch time in microseconds' },
      { name: 'SLOWLOG', template: 'SLOWLOG GET 10', summary: 'Retrieve recent high-latency queries' },
      { name: 'CLIENT LIST', template: 'CLIENT LIST', summary: 'List connected client sockets' },
      { name: 'MEMORY USAGE', template: 'MEMORY USAGE key', summary: 'Inspect exact byte footprint of key' },
    ],
  },
];

interface QuickInsertPanelProps {
  onInsert: (snippet: string) => void;
  onExplain?: (commandName: string) => void;
}

export const QuickInsertPanel: React.FC<QuickInsertPanelProps> = ({ onInsert, onExplain }) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    string: true,
    hash: true,
    list: false,
    set: false,
    zset: false,
    server: false,
  });
  const [filterQuery, setFilterQuery] = useState('');

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const filteredGroups = SNIPPET_GROUPS.map((grp) => {
    if (!filterQuery) return grp;
    const lower = filterQuery.toLowerCase();
    const matchedSnippets = grp.snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.template.toLowerCase().includes(lower) ||
        s.summary.toLowerCase().includes(lower)
    );
    return { ...grp, snippets: matchedSnippets };
  }).filter((grp) => grp.snippets.length > 0);

  return (
    <div className="flex h-full w-full flex-col bg-[#0b101b] border-r border-slate-800 text-slate-300">
      {/* Top Header */}
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Quick Insert</h4>
        </div>

        {/* Filter input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search snippets..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full rounded-md bg-slate-900/90 border border-slate-800 pl-8 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-400 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Accordion List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs">
        {filteredGroups.map((group) => {
          const isExpanded = filterQuery.length > 0 || expandedGroups[group.id];

          return (
            <div key={group.id} className="rounded-lg border border-slate-800/80 bg-slate-950/40 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-900 transition text-slate-200 select-none"
              >
                <div className="flex items-center gap-2">
                  <span className={group.color}>{group.icon}</span>
                  <span>{group.label}</span>
                  <span className="rounded bg-slate-800 px-1 text-[9px] text-slate-400">
                    {group.snippets.length}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>

              {isExpanded && (
                <div className="p-1 space-y-1 bg-slate-950/80 border-t border-slate-850">
                  {group.snippets.map((snip) => (
                    <div
                      key={snip.name}
                      className="group flex items-center justify-between rounded px-2 py-1 hover:bg-slate-900 transition border border-transparent hover:border-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => onInsert(snip.template)}
                        title={`Insert: ${snip.template}`}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sky-400 text-[11px]">{snip.name}</span>
                          <span className="text-[10px] text-slate-400 truncate max-w-[140px]">{snip.summary}</span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate select-none mt-0.5">
                          {snip.template}
                        </div>
                      </button>

                      {onExplain && (
                        <button
                          type="button"
                          onClick={() => onExplain(snip.name)}
                          title={`Explain ${snip.name}`}
                          className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition shrink-0 ml-1"
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
