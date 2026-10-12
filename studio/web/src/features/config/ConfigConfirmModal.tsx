import React, { useState } from 'react';
import { X, Sliders, AlertTriangle, Lock, Unlock, ArrowRight } from 'lucide-react';
import { ConfigParamItem } from './types';

interface ConfigConfirmModalProps {
  param: ConfigParamItem | null;
  newValue: any;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (param: string, value: any, unlock: boolean) => Promise<void>;
}

export const ConfigConfirmModal: React.FC<ConfigConfirmModalProps> = ({
  param,
  newValue,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [unlock, setUnlock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !param) return null;

  const isPassword = param.name === 'requirepass';
  const displayOld = isPassword && param.currentValue ? '********' : String(param.currentValue);
  const displayNew = isPassword && newValue ? '********' : String(newValue);

  const command = `CONFIG SET ${param.name} ${displayNew}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlock) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(param.name, newValue, unlock);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Configuration update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#0d1322] shadow-2xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-sky-400">
            <Sliders className="h-5 w-5" />
            <h3 className="text-base font-semibold text-white">Confirm Configuration Change</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div className="text-xs text-slate-300">
            You are about to dynamically modify runtime parameter{' '}
            <strong className="text-white font-mono">{param.name}</strong>.
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 block">CURRENT VALUE</span>
              <span className="text-slate-300 font-bold">{displayOld || '(empty)'}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-sky-400" />
            <div>
              <span className="text-[10px] text-slate-500 block">NEW VALUE</span>
              <span className="text-emerald-400 font-bold">{displayNew || '(empty)'}</span>
            </div>
          </div>

          <div className="rounded-lg bg-slate-950 p-2.5 border border-slate-800 text-[11px] font-mono text-slate-400">
            Command: <code className="text-sky-300 font-semibold">{command}</code>
          </div>

          {/* Confirm & Unlock Toggle */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unlock}
                onChange={(e) => setUnlock(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-sky-500"
              />
              <span>Confirm & Unlock</span>
            </label>
            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
              {unlock ? <Unlock className="h-3.5 w-3.5 text-emerald-400" /> : <Lock className="h-3.5 w-3.5 text-slate-500" />}
              <span>{unlock ? 'Unlocked' : 'Locked'}</span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !unlock}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all shadow-md ${
              !unlock || loading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-sky-600 hover:bg-sky-500 shadow-sky-950/40'
            }`}
          >
            {loading ? 'Applying...' : 'Apply CONFIG SET'}
          </button>
        </div>
      </div>
    </div>
  );
};
