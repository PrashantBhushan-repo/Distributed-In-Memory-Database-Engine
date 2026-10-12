import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Trash2, CheckCircle2 } from 'lucide-react';
import { CommandChip } from '../../components/CommandChip';

interface BulkDeleteModalProps {
  isOpen: boolean;
  keys: string[];
  onClose: () => void;
  onDeleted: (count: number, command: string) => void;
}

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  keys,
  onClose,
  onDeleted,
}) => {
  const [dryRunData, setDryRunData] = useState<{ count: number; sample: string[]; command: string } | null>(null);
  const [loadingDryRun, setLoadingDryRun] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = keys.length;
  const requiresTypeToConfirm = count > 50;

  useEffect(() => {
    if (isOpen && keys.length > 0) {
      setLoadingDryRun(true);
      setError(null);
      setConfirmInput('');

      fetch('/api/keys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, dryRun: true }),
      })
        .then((r) => r.json())
        .then((data) => {
          setDryRunData(data);
        })
        .catch((err) => {
          setError(err.message || 'Error running dry-run calculation');
        })
        .finally(() => {
          setLoadingDryRun(false);
        });
    }
  }, [isOpen, keys]);

  if (!isOpen) return null;

  const isConfirmEnabled = requiresTypeToConfirm
    ? confirmInput.trim() === String(count)
    : true;

  const handleExecuteDelete = async () => {
    if (!isConfirmEnabled) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/keys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Bulk delete failed');
      }
      onDeleted(data.deletedCount || count, data.command || `DEL ${keys.length} keys`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Bulk deletion error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3 text-red-400">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Bulk Delete Confirmation</h3>
              <p className="text-xs text-slate-400">Permanently evict multiple keys from memory</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Dry-run information */}
        <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Selected Keys to Delete:</span>
            <span className="text-red-400 font-bold text-sm">{count} keys</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px] mb-1">Sample Candidates (first 5):</span>
            <ul className="space-y-1 text-slate-300">
              {(dryRunData?.sample || keys.slice(0, 5)).map((k) => (
                <li key={k} className="truncate bg-slate-900 px-2 py-0.5 rounded border border-slate-800/60">
                  {k}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Command preview */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Raw Redis Command
          </span>
          <CommandChip command={dryRunData?.command || `DEL ${keys.slice(0, 5).join(' ')}${keys.length > 5 ? ' ...' : ''}`} />
        </div>

        {/* Type confirmation required when N > 50 */}
        {requiresTypeToConfirm && (
          <div className="space-y-2 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <label className="text-xs font-semibold text-amber-300 block">
              Safety Guard: Type <span className="font-mono font-bold underline">{count}</span> to confirm deletion:
            </label>
            <input
              type="text"
              placeholder={`Type "${count}" here...`}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-3 py-1.5 text-amber-200 font-mono text-xs focus:outline-none focus:border-amber-400"
            />
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExecuteDelete}
            disabled={!isConfirmEnabled || deleting || loadingDryRun}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            <Trash2 className="h-4 w-4" />
            <span>{deleting ? 'Deleting...' : `Delete ${count} Keys`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
