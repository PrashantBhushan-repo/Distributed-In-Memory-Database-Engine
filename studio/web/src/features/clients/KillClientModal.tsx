import React, { useState } from 'react';
import { ShieldAlert, X, AlertTriangle, Check } from 'lucide-react';
import { ClientInfo } from './types';

interface KillClientModalProps {
  client: ClientInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmed: (id: string) => Promise<void>;
}

export const KillClientModal: React.FC<KillClientModalProps> = ({
  client,
  isOpen,
  onClose,
  onConfirmed,
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen || !client) return null;

  const handleKill = async () => {
    setLoading(true);
    try {
      await onConfirmed(client.id);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-red-800 bg-[#0d101d] shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-red-900/60 bg-red-950/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/40">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-red-300 text-sm">Terminate Client Connection</h3>
              <p className="text-[11px] text-red-200/80">Execute CLIENT KILL ID</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3.5 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Are you sure you want to close the TCP connection for this client socket? Any in-flight command pipelining or transactions will be aborted immediately.
          </p>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Client ID:</span>
              <span className="text-white font-bold">{client.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Address:</span>
              <span className="text-sky-300">{client.addr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Client Name:</span>
              <span className="text-amber-300">{client.name || '(unnamed)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Last Command:</span>
              <span className="text-emerald-300 uppercase">{client.cmd}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Idle Time:</span>
              <span className="text-slate-300">{client.idle} seconds</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/80 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleKill}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-red-950/40 transition"
          >
            <span>{loading ? 'Killing...' : 'Confirm & Kill Socket'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
