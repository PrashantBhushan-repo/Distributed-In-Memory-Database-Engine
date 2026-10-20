import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Play,
  Copy,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
  Tag,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react';
import COMMAND_META_FALLBACK from '../../../../packages/shared/command-meta.json';

interface CommandMeta {
  name: string;
  summary: string;
  syntax: string;
  group: string;
  complexity: string;
  arity: number;
  flags: string[];
  example?: string;
  arguments?: Array<{ name: string; type: string; optional?: boolean; description?: string }>;
  returns?: string;
}

export const LearnCommandsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [commands, setCommands] = useState<CommandMeta[]>(COMMAND_META_FALLBACK as CommandMeta[]);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get('cmd') || '');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedComplexity, setSelectedComplexity] = useState<string>('all');

  // Selected command for Detail Drawer
  const [selectedCommand, setSelectedCommand] = useState<CommandMeta | null>(null);
  const [copiedExample, setCopiedExample] = useState(false);

  // Fetch command list and capabilities
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [cmdRes, capRes] = await Promise.allSettled([
          fetch('/api/commands').then((r) => r.json()),
          fetch('/api/capabilities').then((r) => r.json()),
        ]);

        if (mounted) {
          if (cmdRes.status === 'fulfilled' && Array.isArray(cmdRes.value)) {
            setCommands(cmdRes.value);
          }
          if (capRes.status === 'fulfilled' && Array.isArray(capRes.value?.capabilities)) {
            const supported = new Set<string>(capRes.value.capabilities);
            setCapabilities(Object.fromEntries((COMMAND_META_FALLBACK as CommandMeta[]).map(command => [command.name.toUpperCase(), supported.has(command.name.toUpperCase())])));
          }
        }
      } catch (err) {
        console.warn('Using local fallback for command meta & capabilities', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync selected command with URL ?cmd=
  useEffect(() => {
    const cmdParam = searchParams.get('cmd');
    if (cmdParam && commands.length > 0) {
      const found = commands.find((c) => c.name.toLowerCase() === cmdParam.toLowerCase());
      if (found) {
        setSelectedCommand(found);
      }
    }
  }, [searchParams, commands]);

  // Unique groups for filtering
  const groups = useMemo(() => {
    const set = new Set<string>();
    commands.forEach((c) => {
      if (c.group) set.add(c.group.toLowerCase());
    });
    return Array.from(set).sort();
  }, [commands]);

  // Filtered commands
  const filteredCommands = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return commands.filter((cmd) => {
      // Group filter
      if (selectedGroup !== 'all' && cmd.group.toLowerCase() !== selectedGroup) {
        return false;
      }

      // Complexity filter
      if (selectedComplexity !== 'all') {
        const comp = (cmd.complexity || '').toUpperCase();
        if (selectedComplexity === 'O(1)' && !comp.includes('O(1)')) return false;
        if (selectedComplexity === 'O(log N)' && !comp.includes('LOG')) return false;
        if (selectedComplexity === 'O(N)' && (!comp.includes('O(N)') || comp.includes('O(1)'))) return false;
      }

      // Search query
      if (!q) return true;
      return (
        cmd.name.toLowerCase().includes(q) ||
        cmd.summary.toLowerCase().includes(q) ||
        cmd.syntax.toLowerCase().includes(q) ||
        cmd.group.toLowerCase().includes(q)
      );
    });
  }, [commands, searchQuery, selectedGroup, selectedComplexity]);

  const handleOpenDetail = (cmd: CommandMeta) => {
    setSelectedCommand(cmd);
    setSearchParams({ cmd: cmd.name.toLowerCase() });
  };

  const handleCloseDetail = () => {
    setSelectedCommand(null);
    setSearchParams({});
  };

  const handleCopyExample = (exampleText: string) => {
    navigator.clipboard.writeText(exampleText);
    setCopiedExample(true);
    setTimeout(() => setCopiedExample(false), 2000);
  };

  const handleRunInPlayground = (cmd: CommandMeta) => {
    const exampleCmd = cmd.example || `${cmd.name}`;
    navigate(`/playground?cmd=${encodeURIComponent(exampleCmd)}`);
  };

  // Find related commands in same group
  const relatedCommands = useMemo(() => {
    if (!selectedCommand) return [];
    return commands
      .filter((c) => c.group === selectedCommand.group && c.name !== selectedCommand.name)
      .slice(0, 5);
  }, [selectedCommand, commands]);

  // Is command supported by connected server?
  const isSupported = (name: string) => {
    if (Object.keys(capabilities).length === 0) return true; // Default to true if capabilities not yet loaded
    return Boolean(capabilities[name.toUpperCase()]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-500/10 text-red-400 border border-red-500/20">
              Interactive Reference
            </span>
            <span className="text-xs text-slate-400">Step 13 • Learn Section</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-red-500" />
            Command Reference & Complexity
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Search 68+ Redis commands, inspect worst-case Big-O algorithmic complexities, and run examples directly in the sandbox playground.
          </p>
        </div>

        <div className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2 self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{commands.length} Commands Documented</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-6 relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by command (e.g. SET, ZADD, HGETALL) or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Group Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500 capitalize"
            >
              <option value="all">All Data Types & Groups</option>
              {groups.map((g) => (
                <option key={g} value={g} className="capitalize">
                  {g} Group
                </option>
              ))}
            </select>
          </div>

          {/* Complexity Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedComplexity}
              onChange={(e) => setSelectedComplexity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="all">All Complexities (Big-O)</option>
              <option value="O(1)">O(1) Constant Time</option>
              <option value="O(log N)">O(log N) Logarithmic (Skiplists/Trees)</option>
              <option value="O(N)">O(N) Linear Time (Scans/Collections)</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Group Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedGroup('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
              selectedGroup === 'all'
                ? 'bg-red-600 text-white shadow'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All ({commands.length})
          </button>
          {groups.map((grp) => (
            <button
              key={grp}
              onClick={() => setSelectedGroup(grp)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize whitespace-nowrap transition ${
                selectedGroup === grp
                  ? 'bg-red-600 text-white shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {grp}
            </button>
          ))}
        </div>
      </div>

      {/* Main Command Grid & Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Command Cards Grid */}
        <div className={`${selectedCommand ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-3`}>
          <div className="text-xs text-slate-500 font-mono flex items-center justify-between">
            <span>Showing {filteredCommands.length} of {commands.length} commands</span>
            <span>Click any command for details</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredCommands.map((cmd) => {
              const supported = isSupported(cmd.name);
              const isSelected = selectedCommand?.name === cmd.name;

              // Color badge for complexity
              const comp = (cmd.complexity || '').toUpperCase();
              let compBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              if (comp.includes('LOG')) compBadgeClass = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
              if (comp.includes('O(N)') && !comp.includes('O(1)'))
                compBadgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

              return (
                <div
                  key={cmd.name}
                  onClick={() => handleOpenDetail(cmd)}
                  className={`bg-slate-900 border rounded-2xl p-4 cursor-pointer transition-all hover:border-slate-600 hover:shadow-lg flex flex-col justify-between ${
                    isSelected ? 'border-red-500 ring-1 ring-red-500 shadow-red-950/40' : 'border-slate-800'
                  }`}
                >
                  <div>
                    {/* Header: Name + Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-white tracking-wide">
                        {cmd.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${compBadgeClass}`}
                        >
                          {cmd.complexity || 'O(1)'}
                        </span>
                        {!supported && (
                          <span
                            title="Not supported by current server"
                            className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded"
                          >
                            Unsupp
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Syntax Code block */}
                    <div className="mt-2.5 font-mono text-[11px] text-slate-300 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/80 truncate">
                      {cmd.syntax}
                    </div>

                    {/* Summary */}
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {cmd.summary}
                    </p>
                  </div>

                  {/* Footer Tag */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 capitalize font-medium">{cmd.group}</span>
                    <span className="text-red-400 hover:text-red-300 flex items-center gap-0.5 font-medium">
                      Inspect <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredCommands.length === 0 && (
            <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
              <Search className="h-8 w-8 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-300 font-medium">No commands found matching "{searchQuery}"</p>
              <p className="text-xs text-slate-500">Try adjusting your filters or search term.</p>
            </div>
          )}
        </div>

        {/* Command Detail Side Drawer */}
        {selectedCommand && (
          <div className="lg:col-span-5 sticky top-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5 animate-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-bold text-white tracking-wide">
                    {selectedCommand.name}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 capitalize">
                    {selectedCommand.group}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{selectedCommand.summary}</p>
              </div>

              <button
                onClick={handleCloseDetail}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Server Capability Badge */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">Server Support:</span>
              {isSupported(selectedCommand.name) ? (
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Supported on this RedisX Engine
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                  <XCircle className="h-4 w-4" />
                  Not supported by this server
                </span>
              )}
            </div>

            {/* Syntax */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Full Syntax
              </span>
              <pre className="font-mono text-xs text-slate-100 bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-x-auto">
                <code>{selectedCommand.syntax}</code>
              </pre>
            </div>

            {/* Algorithmic Complexity */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-sky-400" />
                Algorithmic Complexity (Big-O)
              </span>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-mono text-sm font-bold text-sky-400">
                  {selectedCommand.complexity || 'O(1)'}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {selectedCommand.complexity?.includes('O(1)')
                    ? 'Executes in constant time regardless of dataset size.'
                    : selectedCommand.complexity?.includes('log')
                    ? 'Logarithmic time traversal using balanced skiplist span pointers or tree search.'
                    : 'Time scales proportionally to the number of elements scanned or modified.'}
                </p>
              </div>
            </div>

            {/* Practical Example & Playground Trigger */}
            {selectedCommand.example && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Interactive Example
                  </span>
                  <button
                    onClick={() => handleCopyExample(selectedCommand.example!)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedExample ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
                  {selectedCommand.example}
                </div>

                <button
                  onClick={() => handleRunInPlayground(selectedCommand)}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-red-950/50"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Run in Playground (DB 15 Sandbox)
                </button>
              </div>
            )}

            {/* Related Commands */}
            {relatedCommands.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Related {selectedCommand.group} Commands
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {relatedCommands.map((rel) => (
                    <button
                      key={rel.name}
                      onClick={() => handleOpenDetail(rel)}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono text-xs border border-slate-800 transition"
                    >
                      {rel.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
