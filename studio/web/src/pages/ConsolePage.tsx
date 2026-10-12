import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  Trash2,
  Download,
  History,
  Shield,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  Sparkles,
  Layers,
  Zap,
} from 'lucide-react';
import { CommandMeta, ConsoleEntry, RespKind } from '../features/console/types';
import { parseCommandLine, getErrorHint } from '../features/console/commandUtils';
import { OutputBlock } from '../features/console/OutputBlock';
import { ExplainDrawer } from '../features/console/ExplainDrawer';
import { QuickInsertPanel } from '../features/console/QuickInsertPanel';
import { HistorySearchModal } from '../features/console/HistorySearchModal';
import { DangerConfirmModal } from '../features/console/DangerConfirmModal';
import { ConsoleTerminal } from '../features/console/ConsoleTerminal';
import { registerPaletteItems } from '../components/CommandPalette';

const WRITE_COMMAND_NAMES = new Set([
  'SET', 'SETNX', 'MSET', 'MSETNX', 'GETSET', 'APPEND', 'INCR', 'DECR', 'INCRBY', 'DECRBY',
  'DEL', 'UNLINK', 'EXPIRE', 'EXPIREAT', 'PERSIST', 'RENAME', 'RENAMENX',
  'HSET', 'HMSET', 'HSETNX', 'HDEL', 'HINCRBY',
  'LPUSH', 'RPUSH', 'LPUSHX', 'RPUSHX', 'LPOP', 'RPOP', 'LREM', 'LSET', 'LTRIM',
  'SADD', 'SREM', 'SPOP', 'SMOVE',
  'ZADD', 'ZREM', 'ZINCRBY', 'ZREMRANGEBYSCORE', 'ZREMRANGEBYRANK',
  'FLUSHDB', 'FLUSHALL', 'SWAPDB',
]);

export const ConsolePage: React.FC = () => {
  // Command dictionary
  const [commands, setCommands] = useState<CommandMeta[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(true);

  // Console session output entries
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // Selected command for Explain Drawer
  const [explainCmd, setExplainCmd] = useState<CommandMeta | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  // Modals & Panels
  const [quickInsertOpen, setQuickInsertOpen] = useState(true);
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [pendingDangerCmd, setPendingDangerCmd] = useState<{
    cmdStr: string;
    isPipeline: boolean;
    reason?: string;
  } | null>(null);

  // Selected input to push to terminal
  const [terminalInputValue, setTerminalInputValue] = useState('');

  // User context / Role
  const [userRole, setUserRole] = useState<'admin' | 'operator' | 'viewer'>('admin');
  const [activeDb, setActiveDb] = useState(0);

  const outputEndRef = useRef<HTMLDivElement>(null);

  // Load user role from localStorage
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('redisx_user');
      if (storedUser) {
        const u = JSON.parse(storedUser);
        if (u.role) setUserRole(u.role);
      }
    } catch {}
  }, []);

  // Fetch command definitions from Gateway
  useEffect(() => {
    let mounted = true;
    const fetchCommands = async () => {
      try {
        const res = await fetch('/api/commands');
        if (res.ok) {
          const data: CommandMeta[] = await res.json();
          if (mounted && Array.isArray(data)) {
            setCommands(data);
          }
        }
      } catch (err) {
        console.error('Failed to load command dictionary:', err);
      } finally {
        if (mounted) setCommandsLoading(false);
      }
    };
    fetchCommands();
    return () => {
      mounted = false;
    };
  }, []);

  // Register common commands into global Command Palette
  useEffect(() => {
    const unregister = registerPaletteItems([
      {
        id: 'cmd-ping',
        title: 'Run command: PING',
        description: 'Test server latency & connection responsiveness',
        path: '/console',
        category: 'Data',
        icon: <Zap className="h-4 w-4" />,
      },
      {
        id: 'cmd-info',
        title: 'Run command: INFO',
        description: 'Inspect Redis engine metrics and server telemetry',
        path: '/console',
        category: 'Data',
        icon: <Terminal className="h-4 w-4" />,
      },
      {
        id: 'cmd-dbsize',
        title: 'Run command: DBSIZE',
        description: 'Query total count of active keys in current database',
        path: '/console',
        category: 'Data',
        icon: <Terminal className="h-4 w-4" />,
      },
      {
        id: 'cmd-slowlog',
        title: 'Run command: SLOWLOG GET 10',
        description: 'View slowest recent Redis commands',
        path: '/console',
        category: 'Data',
        icon: <Terminal className="h-4 w-4" />,
      },
    ]);
    return unregister;
  }, []);

  // Scroll to bottom on new entry
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  // Open explain drawer by command name
  const handleOpenExplain = useCallback(
    (cmdName: string) => {
      const upper = cmdName.toUpperCase();
      const meta = commands.find((c) => c.name.toUpperCase() === upper);
      if (meta) {
        setExplainCmd(meta);
        setExplainOpen(true);
      } else {
        // Fallback placeholder
        setExplainCmd({
          name: upper,
          summary: `Execute ${upper} command against Redis engine`,
          syntax: `${upper} [arguments...]`,
          group: 'generic',
          complexity: 'O(1) to O(N)',
          arity: -1,
          flags: [],
          example: `${upper}`,
        });
        setExplainOpen(true);
      }
    },
    [commands]
  );

  // Check if command is dangerous
  const checkDangerous = useCallback(
    (cmdString: string): { isDangerous: boolean; reason?: string } => {
      const tokens = parseCommandLine(cmdString);
      if (tokens.length === 0) return { isDangerous: false };
      const verb = tokens[0].toUpperCase();

      if (verb === 'FLUSHALL' || verb === 'FLUSHDB') {
        return {
          isDangerous: true,
          reason: `${verb} immediately deletes all keys across databases.`,
        };
      }
      if (verb === 'SHUTDOWN') {
        return {
          isDangerous: true,
          reason: 'SHUTDOWN will terminate the Redis server process.',
        };
      }
      if (verb === 'DEBUG' && tokens[1]?.toUpperCase() === 'SEGFAULT') {
        return {
          isDangerous: true,
          reason: 'DEBUG SEGFAULT will crash the server process intentionally.',
        };
      }
      if (verb === 'KEYS' && (tokens[1] === '*' || !tokens[1])) {
        return {
          isDangerous: true,
          reason: 'KEYS * performs an unthrottled full keyspace scan that can freeze execution.',
        };
      }

      // Check against metadata
      const meta = commands.find((c) => c.name.toUpperCase() === verb);
      if (meta?.dangerous) {
        return { isDangerous: true, reason: meta.dangerReason };
      }

      return { isDangerous: false };
    },
    [commands]
  );

  // Execute single command via /api/command
  const executeSingle = async (cmdString: string, unlock = false) => {
    const tokens = parseCommandLine(cmdString);
    if (tokens.length === 0) return;
    const verb = tokens[0].toUpperCase();

    // 1. Viewer Role Guard
    if (userRole === 'viewer') {
      const meta = commands.find((c) => c.name.toUpperCase() === verb);
      const isWrite = meta?.flags?.includes('write') || WRITE_COMMAND_NAMES.has(verb);
      if (isWrite) {
        const entry: ConsoleEntry = {
          id: `entry-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          command: cmdString,
          durationMs: 0,
          kind: 'error',
          error: `READONLY: User role '${userRole}' is restricted from executing mutating command '${verb}'.`,
          hint: 'Connect with Operator or Administrator role in connection settings to execute write commands.',
        };
        setEntries((prev) => [...prev, entry]);
        return;
      }
    }

    // 2. Dangerous Command Guard
    if (!unlock) {
      const danger = checkDangerous(cmdString);
      if (danger.isDangerous) {
        setPendingDangerCmd({ cmdStr: cmdString, isPipeline: false, reason: danger.reason });
        return;
      }
    }

    setIsExecuting(true);
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers,
        body: JSON.stringify({ args: tokens, unlock }),
      });

      const data = await res.json();
      if (res.ok) {
        const entry: ConsoleEntry = {
          id: `entry-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          command: cmdString,
          durationMs: data.durationMs || 1,
          kind: data.kind || 'string',
          reply: data.reply,
        };
        setEntries((prev) => [...prev, entry]);
      } else {
        const entry: ConsoleEntry = {
          id: `entry-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          command: cmdString,
          durationMs: 1,
          kind: 'error',
          error: data.message || data.error || 'Execution failed',
          hint: data.hint || getErrorHint(data.message || data.error),
        };
        setEntries((prev) => [...prev, entry]);
      }
    } catch (err: any) {
      const entry: ConsoleEntry = {
        id: `entry-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        command: cmdString,
        durationMs: 1,
        kind: 'error',
        error: err.message || 'Network error connecting to Gateway',
        hint: 'Verify that the RedisX Gateway is running on port 4000.',
      };
      setEntries((prev) => [...prev, entry]);
    } finally {
      setIsExecuting(false);
    }
  };

  // Execute pipeline batch via /api/pipeline
  const executePipelineBatch = async (batchString: string, unlock = false) => {
    const rawLines = batchString
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (rawLines.length === 0) return;

    // Check danger across all pipeline commands
    if (!unlock) {
      for (const line of rawLines) {
        const danger = checkDangerous(line);
        if (danger.isDangerous) {
          setPendingDangerCmd({ cmdStr: batchString, isPipeline: true, reason: danger.reason });
          return;
        }
      }
    }

    setIsExecuting(true);
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers,
        body: JSON.stringify({ commands: rawLines, unlock }),
      });

      const data = await res.json();
      if (res.ok) {
        const entry: ConsoleEntry = {
          id: `entry-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          command: `PIPELINE (${rawLines.length} commands)`,
          isPipeline: true,
          pipelineReplies: data.replies || [],
          durationMs: data.totalDurationMs || 1,
          kind: 'array',
        };
        setEntries((prev) => [...prev, entry]);
      } else {
        const entry: ConsoleEntry = {
          id: `entry-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          command: `PIPELINE (${rawLines.length} commands)`,
          durationMs: 1,
          kind: 'error',
          error: data.message || data.error || 'Pipeline execution failed',
          hint: data.hint,
        };
        setEntries((prev) => [...prev, entry]);
      }
    } catch (err: any) {
      const entry: ConsoleEntry = {
        id: `entry-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        command: `PIPELINE (${rawLines.length} commands)`,
        durationMs: 1,
        kind: 'error',
        error: err.message || 'Network error connecting to Gateway',
      };
      setEntries((prev) => [...prev, entry]);
    } finally {
      setIsExecuting(false);
    }
  };

  // Main execute dispatcher from Terminal
  const handleExecute = (cmdString: string, isPipeline: boolean) => {
    if (isPipeline) {
      executePipelineBatch(cmdString, false);
    } else {
      executeSingle(cmdString, false);
    }
  };

  // Confirm danger modal
  const handleConfirmDanger = () => {
    if (!pendingDangerCmd) return;
    const { cmdStr, isPipeline } = pendingDangerCmd;
    setPendingDangerCmd(null);

    if (isPipeline) {
      executePipelineBatch(cmdStr, true);
    } else {
      executeSingle(cmdStr, true);
    }
  };

  // Export session to .txt file
  const handleExportSession = () => {
    if (entries.length === 0) return;
    const lines: string[] = [
      '====================================================================',
      `RedisX Studio — Interactive Console Session Transcript`,
      `Exported at: ${new Date().toISOString()}`,
      `Database: db${activeDb} | User Role: ${userRole}`,
      '====================================================================\n',
    ];

    entries.forEach((entry, i) => {
      lines.push(`[${entry.timestamp}] redis> ${entry.command} (${entry.durationMs}ms)`);
      if (entry.error) {
        lines.push(`(error) ${entry.error}`);
        if (entry.hint) lines.push(`[Hint: ${entry.hint}]`);
      } else if (entry.isPipeline && entry.pipelineReplies) {
        entry.pipelineReplies.forEach((r, idx) => {
          lines.push(`  ${idx + 1}) ${r.command} -> ${JSON.stringify(r.reply)} (${r.durationMs}ms)`);
        });
      } else if (entry.reply === null) {
        lines.push('(nil)');
      } else if (typeof entry.reply === 'object') {
        lines.push(JSON.stringify(entry.reply, null, 2));
      } else {
        lines.push(String(entry.reply));
      }
      lines.push('');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redisx-console-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col bg-[#070b14] text-slate-100 overflow-hidden">
      {/* Top Console Navigation Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0b101d] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-sans text-sm font-bold text-white tracking-wide">
                Interactive Console
              </h1>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-slate-700">
                127.0.0.1:6379[db{activeDb}]
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase border flex items-center gap-1 ${
                  userRole === 'admin'
                    ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                    : userRole === 'operator'
                    ? 'bg-blue-950/80 text-blue-300 border-blue-800'
                    : 'bg-amber-950/80 text-amber-300 border-amber-800'
                }`}
              >
                <Shield className="h-3 w-3" />
                {userRole}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Direct RESP command execution, pipeline batches, and syntax documentation
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setQuickInsertOpen(!quickInsertOpen)}
            title="Toggle Quick Insert Sidebar"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border transition ${
              quickInsertOpen
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {quickInsertOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
            <span className="text-[11px] hidden sm:inline">Snippets</span>
          </button>

          <button
            type="button"
            onClick={() => setHistorySearchOpen(true)}
            title="Search command history (Ctrl+R)"
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-slate-300 hover:bg-slate-850 hover:text-white transition text-[11px]"
          >
            <History className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden sm:inline">History</span>
            <kbd className="rounded bg-slate-800 px-1 text-[9px] text-slate-400">^R</kbd>
          </button>

          <button
            type="button"
            onClick={handleExportSession}
            disabled={entries.length === 0}
            title="Export session to .txt"
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-slate-300 hover:bg-slate-850 hover:text-white disabled:opacity-40 transition text-[11px]"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            type="button"
            onClick={() => setEntries([])}
            disabled={entries.length === 0}
            title="Clear console output"
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-slate-400 hover:bg-red-950/40 hover:text-red-300 hover:border-red-800/60 disabled:opacity-40 transition text-[11px]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: QuickInsert Sidebar + Output Stream & Terminal */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Snippets Sidebar */}
        {quickInsertOpen && (
          <div className="w-64 shrink-0 border-r border-slate-800 h-full overflow-hidden">
            <QuickInsertPanel
              onInsert={(snippet) => setTerminalInputValue(snippet)}
              onExplain={handleOpenExplain}
            />
          </div>
        )}

        {/* Center / Right: Output Stream & Terminal Input */}
        <div className="flex flex-1 flex-col h-full overflow-hidden">
          {/* Scrollable Output Stream Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Empty state / Welcome card */}
            {entries.length === 0 && (
              <div className="mx-auto max-w-2xl rounded-2xl border border-slate-800/80 bg-slate-950/60 p-6 text-center space-y-4 my-8 shadow-xl">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Terminal className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Welcome to RedisX Console</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                    Execute low-latency Redis commands with full syntax completion, Big-O complexity tooltips,
                    and pipeline batch support.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <span className="text-[11px] text-slate-400">Quick Starters:</span>
                  <button
                    onClick={() => setTerminalInputValue('PING')}
                    className="rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 text-xs font-mono text-sky-300 transition"
                  >
                    PING
                  </button>
                  <button
                    onClick={() => setTerminalInputValue('INFO')}
                    className="rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 text-xs font-mono text-emerald-300 transition"
                  >
                    INFO
                  </button>
                  <button
                    onClick={() => setTerminalInputValue('DBSIZE')}
                    className="rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 text-xs font-mono text-amber-300 transition"
                  >
                    DBSIZE
                  </button>
                  <button
                    onClick={() => setTerminalInputValue('SET user:1001 "Alice"')}
                    className="rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 text-xs font-mono text-purple-300 transition"
                  >
                    SET user:1001 "Alice"
                  </button>
                  <button
                    onClick={() => setTerminalInputValue('HGETALL user:1001')}
                    className="rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 text-xs font-mono text-cyan-300 transition"
                  >
                    HGETALL user:1001
                  </button>
                </div>
              </div>
            )}

            {/* Rendered Command Output Blocks */}
            {entries.map((entry) => (
              <OutputBlock
                key={entry.id}
                entry={entry}
                onCommandClick={handleOpenExplain}
                onRunExample={(cmd) => executeSingle(cmd, false)}
              />
            ))}
            <div ref={outputEndRef} />
          </div>

          {/* Sticky Terminal Input at bottom */}
          <div className="p-3 bg-[#090d19] border-t border-slate-800 shrink-0">
            <ConsoleTerminal
              commands={commands}
              dbIndex={activeDb}
              initialValue={terminalInputValue}
              isExecuting={isExecuting}
              onExecute={handleExecute}
              onOpenExplain={handleOpenExplain}
              onOpenHistorySearch={() => setHistorySearchOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Slide-over Explain Drawer */}
      <ExplainDrawer
        command={explainCmd}
        isOpen={explainOpen}
        onClose={() => setExplainOpen(false)}
        onInsertCommand={(cmd) => setTerminalInputValue(cmd)}
        onRunCommand={(cmd) => executeSingle(cmd, false)}
      />

      {/* History Search (Ctrl+R) Modal */}
      <HistorySearchModal
        isOpen={historySearchOpen}
        onClose={() => setHistorySearchOpen(false)}
        onSelectCommand={(cmd) => setTerminalInputValue(cmd)}
      />

      {/* Dangerous Operation Confirmation Modal */}
      <DangerConfirmModal
        isOpen={pendingDangerCmd !== null}
        commandStr={pendingDangerCmd?.cmdStr || ''}
        dangerReason={pendingDangerCmd?.reason}
        onConfirm={handleConfirmDanger}
        onCancel={() => setPendingDangerCmd(null)}
      />
    </div>
  );
};
