import React, { useState } from 'react';
import {
  X,
  Clock,
  Sparkles,
  Search,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface BulkSetTtlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void;
}

export const BulkSetTtlModal: React.FC<BulkSetTtlModalProps> = ({
  isOpen,
  onClose,
  onApplied,
}) => {
  const [pattern, setPattern] = useState('session:*');
  const [ttl, setTtl] = useState(3600);
  const [previewResult, setPreviewResult] = useState<{
    matchedCount: number;
    sample: string[];
    command: string;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePreview = async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/expiration/bulk-set', {
        method: 'POST',
        headers,
        body: JSON.stringify({ pattern, ttl, previewOnly: true }),
      });

      const data = await res.json();
      if (res.ok) {
        setPreviewResult({
          matchedCount: data.matchedCount,
          sample: data.sample || [],
          command: data.command,
        });
      } else {
        setError(data.error || 'Failed to scan matching keys');
      }
    } catch (err: any) {
      setError(err.message || 'Network error scanning keys');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    setError(null);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/expiration/bulk-set', {
        method: 'POST',
        headers,
        body: JSON.stringify({ pattern, ttl, previewOnly: false }),
      });

      const data = await res.json();
      if (res.ok) {
        onApplied?.();
        onClose();
      } else {
        setError(data.message || data.error || 'Failed to apply bulk TTL expiration.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error applying expiration.');
    } finally {
      setIsApplying(false);
    }
  };

  const PRESETS = [
    { label: '1 Minute', sec: 60 },
    { label: '1 Hour', sec: 3600 },
    { label: '1 Day', sec: 86400 },
    { label: '7 Days', sec: 604800 },
    { label: 'Persist (Remove TTL)', sec: -1 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0d1322] shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Bulk Configure Key Expiration (TTL)</h3>
              <p className="text-[11px] text-slate-400">Apply or remove expiration across key patterns</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 text-xs">
          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/50 p-2.5 text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Pattern Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300">
              Key Matching Pattern:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. session:* or rate_limit:*"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handlePreview}
                disabled={loadingPreview || !pattern.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 font-semibold text-slate-200 transition"
              >
                {loadingPreview ? (
                  <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                <span>Scan Matches</span>
              </button>
            </div>
          </div>

          {/* TTL Input & Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300">
                Expiration Duration (seconds):
              </label>
              <span className="font-mono text-amber-400 font-bold">
                {ttl === -1 ? 'Persistent (No Expiration)' : `${ttl.toLocaleString()}s`}
              </span>
            </div>

            <input
              type="number"
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
            />

            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((p) => (
                <button
                  key={p.sec}
                  type="button"
                  onClick={() => setTtl(p.sec)}
                  className={`rounded px-2.5 py-1 text-[10px] font-mono transition ${
                    ttl === p.sec
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Results */}
          {previewResult && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold">Matched Keys:</span>
                <span className="font-mono font-bold text-sky-400 text-xs">
                  {previewResult.matchedCount.toLocaleString()} keys
                </span>
              </div>

              {previewResult.sample.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400">Sample of matched keys:</span>
                  <div className="rounded bg-slate-900/90 p-2 font-mono text-[10px] text-slate-300 space-y-0.5">
                    {previewResult.sample.map((k, i) => (
                      <div key={i} className="truncate">• {k}</div>
                    ))}
                    {previewResult.matchedCount > previewResult.sample.length && (
                      <div className="text-slate-400 italic">
                        ... and {previewResult.matchedCount - previewResult.sample.length} more keys
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded bg-slate-900 p-2 font-mono text-[11px] text-amber-300 break-all">
                {previewResult.command}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/80 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || !previewResult || previewResult.matchedCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-950/40 transition"
          >
            {isApplying ? (
              <RotateCcw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>Apply Expiration ({previewResult ? previewResult.matchedCount : 0} keys)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
