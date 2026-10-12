import React, { useState } from 'react';
import { Sliders, X, Check, Lock, Unlock, AlertTriangle } from 'lucide-react';

interface ThresholdConfigModalProps {
  currentThresholdUs: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (us: number, unlock: boolean) => Promise<void>;
}

export const ThresholdConfigModal: React.FC<ThresholdConfigModalProps> = ({
  currentThresholdUs,
  isOpen,
  onClose,
  onSave,
}) => {
  const [valUs, setValUs] = useState(currentThresholdUs);
  const [unlock, setUnlock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSave(valUs, unlock);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update threshold');
    } finally {
      setLoading(false);
    }
  };

  const PRESETS = [
    { label: '1 ms (1,000 µs)', us: 1000 },
    { label: '5 ms (5,000 µs)', us: 5000 },
    { label: '10 ms (Default)', us: 10000 },
    { label: '50 ms (50,000 µs)', us: 50000 },
    { label: '100 ms (100,000 µs)', us: 100000 },
    { label: 'Disabled (-1)', us: -1 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0d1322] shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95">
        <form onSubmit={handleSave}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                <Sliders className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Slow Log Threshold Configuration</h3>
                <p className="text-[11px] text-slate-400">CONFIG SET slowlog-log-slower-than</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs">
            {error && (
              <div className="rounded-lg border border-red-900 bg-red-950/50 p-2.5 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            <p className="text-slate-300 leading-relaxed">
              Commands whose execution latency exceeds this threshold (in microseconds) will be recorded in the circular diagnostic buffer.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-400">
                  Threshold (microseconds):
                </label>
                <span className="font-mono text-emerald-400 font-bold">
                  {valUs === -1 ? 'Logging Disabled' : `${valUs.toLocaleString()} µs (${(valUs / 1000).toFixed(1)} ms)`}
                </span>
              </div>
              <input
                type="number"
                value={valUs}
                onChange={(e) => setValUs(Number(e.target.value))}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((p) => (
                <button
                  key={p.us}
                  type="button"
                  onClick={() => setValUs(p.us)}
                  className={`rounded px-2.5 py-1 text-[10px] font-mono transition ${
                    valUs === p.us
                      ? 'bg-sky-600 text-white font-bold'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Admin unlock checkbox */}
            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={unlock}
                  onChange={(e) => setUnlock(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 h-4 w-4"
                />
                <span className="text-xs text-slate-300">
                  Confirm &amp; Unlock Live Server Parameter Update
                </span>
              </label>
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
              disabled={loading || !unlock}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-sky-950/40 transition"
            >
              {unlock ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span>{loading ? 'Saving...' : 'Apply CONFIG SET'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
