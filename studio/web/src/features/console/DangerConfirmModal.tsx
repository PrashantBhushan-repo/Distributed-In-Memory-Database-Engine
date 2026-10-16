import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X, Check, Lock, Unlock } from 'lucide-react';

interface DangerConfirmModalProps {
  isOpen: boolean;
  commandStr: string;
  dangerReason?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DangerConfirmModal: React.FC<DangerConfirmModalProps> = ({
  isOpen,
  commandStr,
  dangerReason,
  onConfirm,
  onCancel,
}) => {
  const [confirmInput, setConfirmInput] = useState('');

  if (!isOpen) return null;

  const isConfirmed = confirmInput.trim().toUpperCase() === 'CONFIRM';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-red-800 bg-[#0d101d] shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-red-900/60 bg-red-950/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/40">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-red-300 text-sm">Dangerous Command Execution</h3>
              <p className="text-[11px] text-red-200/80">Safety Guardian Gatekeeper Activated</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Target Command
            </span>
            <div className="font-mono text-sm font-bold text-red-400 break-all select-all">
              {commandStr}
            </div>
          </div>

          <p className="text-slate-300 leading-relaxed">
            {dangerReason ||
              'This command can purge all in-memory keyspaces, terminate active replication loops, or freeze single-threaded event processing.'}
          </p>

          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 text-amber-200/90 text-[11px] flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Confirmation Required: </span>
              To unlock and execute this potentially destructive command, type <strong className="font-mono text-white bg-slate-800 px-1 py-0.5 rounded">CONFIRM</strong> below.
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <input
              type="text"
              placeholder="Type CONFIRM to authorize..."
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 font-mono tracking-widest focus:border-red-500 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/80 px-6 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isConfirmed}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-950/40 transition"
          >
            <Unlock className="h-3.5 w-3.5" />
            <span>Unlock &amp; Execute</span>
          </button>
        </div>
      </div>
    </div>
  );
};
