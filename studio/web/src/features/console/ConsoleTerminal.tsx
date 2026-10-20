import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import {
  Send,
  Layers,
  HelpCircle,
  History,
  RotateCcw,
  Sparkles,
  Zap,
  Info,
  CornerDownLeft,
} from 'lucide-react';
import { CommandMeta } from './types';
import { loadConsoleHistory, saveConsoleHistory } from './commandUtils';
import { getDisplayHostname } from '../../utils/host';

interface ConsoleTerminalProps {
  commands: CommandMeta[];
  dbIndex: number;
  serverHost?: string;
  serverPort?: number;
  onExecute: (cmdString: string, isPipeline: boolean) => void;
  onOpenExplain: (cmdName: string) => void;
  onOpenHistorySearch: () => void;
  initialValue?: string;
  isExecuting?: boolean;
}

export const ConsoleTerminal: React.FC<ConsoleTerminalProps> = ({
  commands,
  dbIndex,
  serverHost = getDisplayHostname(),
  serverPort = 6379,
  onExecute,
  onOpenExplain,
  onOpenHistorySearch,
  initialValue = '',
  isExecuting = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const [pipelineMode, setPipelineMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [localHistory, setLocalHistory] = useState<string[]>([]);
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  // Load history on mount
  useEffect(() => {
    setLocalHistory(loadConsoleHistory());
  }, []);

  // Update value if initialValue changes externally (e.g. from QuickInsert)
  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      setHistoryIndex(-1);
    }
  }, [initialValue]);

  // Command lookup map
  const commandMap = useMemo(() => {
    const map = new Map<string, CommandMeta>();
    commands.forEach((cmd) => {
      map.set(cmd.name.toUpperCase(), cmd);
    });
    return map;
  }, [commands]);

  // Detect active command for syntax hint
  const activeCommandMeta = useMemo(() => {
    const firstWord = value.trim().split(/\s+/)[0]?.toUpperCase();
    if (!firstWord) return null;
    return commandMap.get(firstWord) || null;
  }, [value, commandMap]);

  // Count commands in pipeline mode
  const pipelineLines = useMemo(() => {
    if (!pipelineMode) return [];
    return value
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  }, [value, pipelineMode]);

  // Submit action
  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isExecuting) return;

    if (pipelineMode) {
      const cmds = value
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
      if (cmds.length === 0) return;

      // Save full script into history
      const updated = [...localHistory, trimmed];
      saveConsoleHistory(updated);
      setLocalHistory(updated);
      setHistoryIndex(-1);

      onExecute(trimmed, true);
      setValue('');
    } else {
      // Single command
      const updated = [...localHistory, trimmed];
      saveConsoleHistory(updated);
      setLocalHistory(updated);
      setHistoryIndex(-1);

      onExecute(trimmed, false);
      setValue('');
    }
  }, [value, isExecuting, pipelineMode, localHistory, onExecute]);

  // History navigation: Up arrow
  const handleHistoryUp = useCallback(() => {
    if (pipelineMode || localHistory.length === 0) return false;
    let nextIndex = historyIndex;
    if (nextIndex === -1) {
      nextIndex = localHistory.length - 1;
    } else if (nextIndex > 0) {
      nextIndex -= 1;
    } else {
      return true;
    }
    setHistoryIndex(nextIndex);
    setValue(localHistory[nextIndex] || '');
    return true;
  }, [pipelineMode, localHistory, historyIndex]);

  // History navigation: Down arrow
  const handleHistoryDown = useCallback(() => {
    if (pipelineMode || historyIndex === -1) return false;
    let nextIndex = historyIndex + 1;
    if (nextIndex >= localHistory.length) {
      setHistoryIndex(-1);
      setValue('');
    } else {
      setHistoryIndex(nextIndex);
      setValue(localHistory[nextIndex] || '');
    }
    return true;
  }, [pipelineMode, localHistory, historyIndex]);

  // CodeMirror Extensions
  const extensions = useMemo(() => {
    const completionSource = (context: CompletionContext) => {
      const word = context.matchBefore(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!word && !context.explicit) return null;

      const prefix = word ? word.text.toUpperCase() : '';
      const matched = commands
        .filter((c) => !prefix || c.name.toUpperCase().startsWith(prefix))
        .slice(0, 25);

      return {
        from: word ? word.from : context.pos,
        options: matched.map((cmd) => ({
          label: cmd.name,
          type: 'keyword',
          detail: cmd.syntax,
          info: `${cmd.summary}\n\nComplexity: ${cmd.complexity}`,
          boost: cmd.flags.includes('fast') ? 2 : 1,
        })),
      };
    };

    const customKeymap = Prec.highest(
      keymap.of([
        {
          key: 'Enter',
          run: () => {
            if (pipelineMode) {
              return false; // let newline be inserted
            }
            handleSubmit();
            return true;
          },
        },
        {
          key: 'Shift-Enter',
          run: () => {
            return false; // insert newline
          },
        },
        {
          key: 'Mod-Enter',
          run: () => {
            handleSubmit();
            return true;
          },
        },
        {
          key: 'ArrowUp',
          run: (view) => {
            const cursor = view.state.selection.main.head;
            const line = view.state.doc.lineAt(cursor);
            if (line.number === 1) {
              return handleHistoryUp();
            }
            return false;
          },
        },
        {
          key: 'ArrowDown',
          run: (view) => {
            const cursor = view.state.selection.main.head;
            const line = view.state.doc.lineAt(cursor);
            if (line.number === view.state.doc.lines) {
              return handleHistoryDown();
            }
            return false;
          },
        },
        {
          key: 'Mod-r',
          run: () => {
            onOpenHistorySearch();
            return true;
          },
        },
      ])
    );

    return [
      autocompletion({
        override: [completionSource],
        defaultKeymap: true,
      }),
      customKeymap,
      EditorView.lineWrapping,
    ];
  }, [
    commands,
    pipelineMode,
    handleSubmit,
    handleHistoryUp,
    handleHistoryDown,
    onOpenHistorySearch,
  ]);

  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#0a0f1d] shadow-xl overflow-hidden text-xs">
      {/* Syntax Hint Header Bar */}
      {activeCommandMeta && (
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3.5 py-2 text-[11px]">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="font-mono font-bold text-sky-400 shrink-0">
              {activeCommandMeta.name}
            </span>
            <span className="font-mono text-slate-300 truncate">
              {activeCommandMeta.syntax}
            </span>
            <span className="text-slate-400 text-[10px] hidden sm:inline">
              — {activeCommandMeta.complexity}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenExplain(activeCommandMeta.name)}
            className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 hover:underline shrink-0 ml-2"
          >
            <Info className="h-3.5 w-3.5" /> Explain
          </button>
        </div>
      )}

      {/* Editor & Prompt */}
      <div className="flex items-start p-3 gap-2.5">
        {/* Terminal Prompt Tag */}
        <div className="flex items-center gap-1 font-mono text-emerald-400 font-bold select-none pt-1 shrink-0">
          <span className="text-slate-400 text-[11px]">{serverHost}:{serverPort}[db{dbIndex}]&gt;</span>
        </div>

        {/* CodeMirror Input */}
        <div className="flex-1 min-h-[36px] font-mono text-slate-100">
          <CodeMirror
            ref={cmRef}
            value={value}
            onChange={(val) => {
              setValue(val);
              if (historyIndex !== -1) setHistoryIndex(-1);
            }}
            theme="dark"
            basicSetup={{
              lineNumbers: pipelineMode,
              foldGutter: false,
              highlightActiveLine: false,
              autocompletion: true,
            }}
            extensions={extensions}
            placeholder={
              pipelineMode
                ? 'Type multiple commands (one per line, e.g. SET k v, INCR k). Press Ctrl+Enter to execute batch.'
                : 'Enter Redis command (e.g. SET greeting "Hello RedisX", HGETALL user:1001)...'
            }
            className="rounded bg-transparent text-[13px] leading-relaxed [&_.cm-editor]:bg-transparent [&_.cm-focused]:outline-none"
          />
        </div>

        {/* Execute Action Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim() || isExecuting}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 px-3 py-1.5 font-sans font-semibold text-white shadow-md shadow-sky-900/30 transition shrink-0 self-end"
        >
          {isExecuting ? (
            <RotateCcw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          <span>{pipelineMode ? 'Run Pipeline' : 'Send'}</span>
        </button>
      </div>

      {/* Bottom Status / Mode Bar */}
      <div className="flex flex-wrap items-center justify-between border-t border-slate-800/80 bg-slate-950/90 px-3.5 py-1.5 text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          {/* Pipeline Mode Toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pipelineMode}
              onChange={(e) => setPipelineMode(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 h-3.5 w-3.5"
            />
            <span className={pipelineMode ? 'font-semibold text-sky-400' : 'text-slate-400'}>
              Pipeline Mode
            </span>
          </label>

          {pipelineMode && (
            <span className="rounded bg-indigo-950/70 border border-indigo-800/60 px-1.5 py-0.5 text-[10px] text-indigo-300 font-semibold">
              {pipelineLines.length} command{pipelineLines.length !== 1 ? 's' : ''} queued
            </span>
          )}
        </div>

        {/* Shortcuts Hint */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span>
            <kbd className="rounded bg-slate-800 px-1 text-slate-300">
              {pipelineMode ? 'Ctrl+Enter' : 'Enter'}
            </kbd>{' '}
            execute
          </span>
          <span>
            <kbd className="rounded bg-slate-800 px-1 text-slate-300">Shift+Enter</kbd> newline
          </span>
          <button
            type="button"
            onClick={onOpenHistorySearch}
            className="hover:text-sky-300 flex items-center gap-0.5"
          >
            <kbd className="rounded bg-slate-800 px-1 text-slate-300">Ctrl+R</kbd> history
          </button>
        </div>
      </div>
    </div>
  );
};
