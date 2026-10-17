import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Trash2, RotateCcw, AlertCircle, CornerDownLeft } from 'lucide-react';
import { getDisplayHost } from '../../utils/host';

interface ConsoleEntry {
  command: string;
  reply: any;
  rawReply?: string;
  isError?: boolean;
  durationMs?: number;
}

interface PlaygroundConsoleProps {
  entries: ConsoleEntry[];
  onExecute: (command: string) => Promise<void>;
  onOpenResetModal: () => void;
  onClearConsole: () => void;
  executing: boolean;
}

export const PlaygroundConsole: React.FC<PlaygroundConsoleProps> = ({
  entries,
  onExecute,
  onOpenResetModal,
  onClearConsole,
  executing,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = inputVal.trim();
    if (!cmd || executing) return;

    setHistory((prev) => [cmd, ...prev]);
    setHistoryIndex(-1);
    setInputVal('');
    await onExecute(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIndex + 1 < history.length) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setInputVal(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInputVal(history[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputVal('');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
      {/* Console Top Toolbar */}
      <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-red-500" />
          <span className="font-bold text-slate-200 text-xs">Sandbox Console (DB 15)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-950/60 border border-red-800/60 text-red-400 font-bold">
            PREFIX: play:*
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClearConsole}
            title="Clear Console Output"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenResetModal}
            className="px-2 py-0.5 rounded bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Reset Sandbox
          </button>
        </div>
      </div>

      {/* Console Output Log */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono">
        {entries.length === 0 ? (
          <div className="text-slate-600 text-xs py-4">
            Type any command prefixed with <strong>play:</strong> (e.g. <code>SET play:greeting "Hello"</code>) or click a lesson on the left to inspect real-time internal structures.
          </div>
        ) : (
          entries.map((entry, idx) => (
            <div key={idx} className="space-y-1">
              {/* Command line */}
              <div className="flex items-center justify-between text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="text-red-500 font-bold">{getDisplayHost()}[15]&gt;</span>
                  <span className="text-slate-100 font-bold">{entry.command}</span>
                </div>
                {entry.durationMs !== undefined && (
                  <span className="text-[10px] text-slate-600">{entry.durationMs}ms</span>
                )}
              </div>

              {/* Reply or error output */}
              <div
                className={`p-2 rounded-lg text-xs whitespace-pre-wrap break-all ${
                  entry.isError
                    ? 'bg-rose-950/20 border border-rose-800/40 text-rose-400'
                    : 'bg-slate-900/60 border border-slate-800/60 text-emerald-400'
                }`}
              >
                {entry.rawReply || String(entry.reply)}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Command Input Prompt */}
      <form onSubmit={handleSubmit} className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
        <span className="text-red-500 font-bold select-none shrink-0">[15]&gt;</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="SET play:k v | LPUSH play:list v | HSET play:h f v..."
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={executing}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-red-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={!inputVal.trim() || executing}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1 transition-colors shrink-0"
        >
          <Send className="w-3 h-3" />
          {executing ? '...' : 'Run'}
        </button>
      </form>
    </div>
  );
};
