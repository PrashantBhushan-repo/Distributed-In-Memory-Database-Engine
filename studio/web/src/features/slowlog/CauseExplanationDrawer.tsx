import React from 'react';
import {
  X,
  AlertTriangle,
  Lightbulb,
  Check,
  Copy,
  Zap,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { SlowLogCauseHint } from './types';

interface CauseExplanationDrawerProps {
  hint: SlowLogCauseHint | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CauseExplanationDrawer: React.FC<CauseExplanationDrawerProps> = ({
  hint,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !hint) return null;

  const handleCopy = () => {
    if (!hint.alternative) return;
    navigator.clipboard.writeText(hint.alternative);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative flex h-full w-full max-w-md flex-col bg-[#0b101b] border-l border-slate-800 shadow-2xl text-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-base font-bold text-white tracking-wider">
                  {hint.command}
                </h3>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase border ${
                    hint.severity === 'critical'
                      ? 'bg-red-950 text-red-400 border-red-800'
                      : 'bg-amber-950 text-amber-400 border-amber-800'
                  }`}
                >
                  {hint.severity}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Slow Log Diagnostic &amp; Mitigation</p>
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
          {/* Why it was slow */}
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-red-400 font-bold text-[11px]">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Root Cause of Latency Spike</span>
            </div>
            <p className="text-slate-300 leading-relaxed pl-6">
              {hint.cause}
            </p>
          </div>

          {/* Recommended Architectural Fix */}
          <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-[11px]">
              <Lightbulb className="h-4 w-4 shrink-0" />
              <span>Recommended Fix / Alternative Pattern</span>
            </div>
            <p className="text-slate-200 leading-relaxed pl-6">
              {hint.fix}
            </p>
          </div>

          {/* Alternative Command */}
          {hint.alternative && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-sky-400" /> Non-blocking Alternative Command
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] text-sky-300 select-all">
                {hint.alternative}
              </div>
            </div>
          )}

          {/* Core Principle Tip */}
          <div className="rounded-lg bg-slate-900/80 p-3 border border-slate-850 space-y-1 text-slate-300">
            <div className="font-semibold text-white text-[11px]">Core Redis SRE Rule:</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Never run unbounded $O(N)$ operations against production instances. Always use cursor-based iteration (SCAN, HSCAN, SSCAN, ZSCAN) and asynchronous background reclamation (UNLINK, FLUSHALL ASYNC).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 p-4 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-1.5 text-xs font-semibold text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
