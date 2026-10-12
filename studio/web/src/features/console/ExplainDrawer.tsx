import React from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  Play,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  Code,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CommandMeta } from './types';

interface ExplainDrawerProps {
  command: CommandMeta | null;
  isOpen: boolean;
  onClose: () => void;
  onInsertCommand?: (cmd: string) => void;
  onRunCommand?: (cmd: string) => void;
}

export const ExplainDrawer: React.FC<ExplainDrawerProps> = ({
  command,
  isOpen,
  onClose,
  onInsertCommand,
  onRunCommand,
}) => {
  const navigate = useNavigate();
  const [copiedExample, setCopiedExample] = React.useState(false);
  const [copiedSyntax, setCopiedSyntax] = React.useState(false);

  if (!isOpen || !command) return null;

  const handleCopyExample = () => {
    if (!command.example) return;
    navigator.clipboard.writeText(command.example);
    setCopiedExample(true);
    setTimeout(() => setCopiedExample(false), 1500);
  };

  const handleCopySyntax = () => {
    if (!command.syntax) return;
    navigator.clipboard.writeText(command.syntax);
    setCopiedSyntax(true);
    setTimeout(() => setCopiedSyntax(false), 1500);
  };

  const handleRunInPlayground = () => {
    onClose();
    navigate(`/playground?cmd=${encodeURIComponent(command.example || command.name)}`);
  };

  const getGroupBadgeColor = (group: string) => {
    switch (group) {
      case 'string':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
      case 'hash':
        return 'bg-amber-950/80 text-amber-400 border-amber-800';
      case 'list':
        return 'bg-cyan-950/80 text-cyan-400 border-cyan-800';
      case 'set':
        return 'bg-purple-950/80 text-purple-400 border-purple-800';
      case 'zset':
        return 'bg-rose-950/80 text-rose-400 border-rose-800';
      case 'server':
        return 'bg-blue-950/80 text-blue-400 border-blue-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative flex h-full w-full max-w-md flex-col bg-[#0b101b] border-l border-slate-800 shadow-2xl text-slate-200 animate-in slide-in-from-right duration-200"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-base font-bold text-white tracking-wider">{command.name}</h3>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase border ${getGroupBadgeColor(command.group)}`}>
                  {command.group}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Command Reference & Interactive Runner</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Dangerous warning */}
          {command.dangerous && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-3.5 space-y-1">
              <div className="flex items-center gap-2 text-red-400 font-bold text-[11px]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Dangerous / High-Impact Command</span>
              </div>
              <p className="text-[11px] text-red-200/90 leading-relaxed pl-6">
                {command.dangerReason || 'This command can block latency or purge data across key namespaces.'}
              </p>
            </div>
          )}

          {/* Syntax Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5">
                <Code className="h-3.5 w-3.5 text-sky-400" /> Syntax
              </span>
              <button
                onClick={handleCopySyntax}
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
              >
                {copiedSyntax ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedSyntax ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] text-sky-300 break-all select-all">
              {command.syntax}
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400">Summary</span>
            <p className="text-slate-300 leading-relaxed bg-slate-900/50 rounded-lg p-3 border border-slate-800/80">
              {command.summary}
            </p>
          </div>

          {/* Time Complexity */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <Clock className="h-3.5 w-3.5 text-amber-400" /> Time Complexity
            </span>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-amber-300/90 text-[11px]">
              {command.complexity}
            </div>
          </div>

          {/* Flags & Arity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Arity
              </span>
              <span className="font-mono text-white text-[12px] font-bold">
                {command.arity} token{Math.abs(command.arity) !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Engine Flags
              </span>
              <div className="flex flex-wrap gap-1">
                {command.flags && command.flags.length > 0 ? (
                  command.flags.map((flag) => (
                    <span
                      key={flag}
                      className="rounded bg-slate-800 px-1 py-0.5 text-[9px] font-mono text-slate-300"
                    >
                      {flag}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 text-[10px]">none</span>
                )}
              </div>
            </div>
          </div>

          {/* Example Section */}
          {command.example && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Concrete Example
                </span>
                <button
                  onClick={handleCopyExample}
                  className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {copiedExample ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedExample ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-2.5 font-mono text-emerald-300 text-[11px] break-all select-all">
                {command.example}
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => {
                    onRunCommand?.(command.example);
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 text-white font-semibold shadow-md shadow-emerald-900/30 transition text-xs"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Run Example in Console
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onInsertCommand?.(command.example);
                      onClose();
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 py-1.5 text-slate-200 transition text-[11px]"
                  >
                    Insert in Input
                  </button>

                  <button
                    onClick={handleRunInPlayground}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-800 py-1.5 text-indigo-300 transition text-[11px]"
                  >
                    <Layers className="h-3 w-3" /> Playground <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
