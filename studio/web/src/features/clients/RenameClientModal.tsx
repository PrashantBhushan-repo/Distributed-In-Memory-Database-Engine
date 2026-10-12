import React, { useState, useEffect } from 'react';
import { Tag, X, Check } from 'lucide-react';
import { ClientInfo } from './types';

interface RenameClientModalProps {
  client: ClientInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onRenamed: (id: string, newName: string) => Promise<void>;
}

export const RenameClientModal: React.FC<RenameClientModalProps> = ({
  client,
  isOpen,
  onClose,
  onRenamed,
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name || '');
    }
  }, [client]);

  if (!isOpen || !client) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onRenamed(client.id, name.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0d1322] shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95">
        <form onSubmit={handleSave}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                <Tag className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Rename Client Connection</h3>
                <p className="text-[11px] text-slate-400">Execute CLIENT SETNAME</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-3 text-xs">
            <div className="text-slate-300">
              Assign a human-readable identifier to client connection ID <strong className="font-mono text-sky-300">{client.id}</strong> ({client.addr}).
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-[11px] font-semibold text-slate-400">
                New Connection Name:
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. webapp_primary_worker"
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
                autoFocus
              />
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
              type="submit"
              disabled={loading || !name.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-sky-950/40 transition"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{loading ? 'Saving...' : 'Save Name'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
