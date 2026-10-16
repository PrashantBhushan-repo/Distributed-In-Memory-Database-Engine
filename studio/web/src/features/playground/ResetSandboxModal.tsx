import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, Check, Database } from 'lucide-react';

interface ResetSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetConfirmed: () => void;
}

export const ResetSandboxModal: React.FC<ResetSandboxModalProps> = ({
  isOpen,
  onClose,
  onResetConfirmed,
}) => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ count: number; keys: string[] } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchPreview = async () => {
      try {
        const token = localStorage.getItem('redisx_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/playground/reset/preview', { headers });
        if (res.ok) {
          const data = await res.json();
          setPreview(data);
        }
      } catch (err) {
        console.error('Error fetching reset preview:', err);
      }
    };
    fetchPreview();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/playground/reset', { method: 'POST', headers, body: '{}' });
      if (res.ok) {
        onResetConfirmed();
        onClose();
      }
    } catch (err) {
      console.error('Failed to reset sandbox:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-rose-400">
            <Trash2 className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-100">Reset Playground Sandbox</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice */}
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            This action will delete all <strong>play:*</strong> keys strictly inside sandbox <strong>DB 15</strong>. All other keyspaces and databases are unaffected.
          </div>
        </div>

        {/* Count Preview */}
        <div className="space-y-1.5 text-xs text-slate-300 font-mono">
          <div className="flex justify-between py-1 border-b border-slate-800">
            <span className="text-slate-400">Target Database:</span>
            <span className="font-bold text-slate-100">DB 15 (Sandbox)</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800">
            <span className="text-slate-400">Keys to Delete:</span>
            <span className="font-bold text-rose-400">{preview?.count ?? '...'} keys</span>
          </div>
        </div>

        {preview && preview.keys.length > 0 && (
          <div className="space-y-1">
            <span className="text-[11px] text-slate-500 font-mono">Sample keys to be purged:</span>
            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 max-h-24 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-0.5">
              {preview.keys.map((k) => (
                <div key={k}>{k}</div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {loading ? 'Purging...' : 'Purge play:* Keys'}
          </button>
        </div>
      </div>
    </div>
  );
};
