import React, { useState, useEffect } from 'react';
import { Copy, Check, Clock, Trash2, Edit3, X, AlertTriangle } from 'lucide-react';
import { KeyDetail } from '../types';
import { getTypeBadgeConfig, formatBytes, formatTtl } from '../formatters';
import { InfoTip } from '../../../components/InfoTip';

interface KeyDetailHeaderProps {
  detail: KeyDetail;
  isViewer?: boolean;
  onTtlUpdated: (newTtl: number, command: string) => Promise<void>;
  onKeyDeleted: (command: string) => Promise<void>;
}

export const KeyDetailHeader: React.FC<KeyDetailHeaderProps> = ({
  detail,
  isViewer = false,
  onTtlUpdated,
  onKeyDeleted,
}) => {
  const [copied, setCopied] = useState(false);
  const [ttlPopoverOpen, setTtlPopoverOpen] = useState(false);
  const [customTtl, setCustomTtl] = useState<string>('');
  const [updatingTtl, setUpdatingTtl] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Live TTL countdown
  const [currentTtl, setCurrentTtl] = useState(detail.ttl);

  useEffect(() => {
    setCurrentTtl(detail.ttl);
    if (detail.ttl <= 0) return;

    const timer = setInterval(() => {
      setCurrentTtl((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [detail.ttl, detail.name]);

  const copyName = () => {
    navigator.clipboard.writeText(detail.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleApplyTtl = async (seconds: number) => {
    if (isViewer) return;
    setUpdatingTtl(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/ttl`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: seconds }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentTtl(seconds);
        await onTtlUpdated(seconds, data.command || `EXPIRE ${detail.name} ${seconds}`);
        setTtlPopoverOpen(false);
      }
    } finally {
      setUpdatingTtl(false);
    }
  };

  const handleDelete = async () => {
    if (isViewer) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        await onKeyDeleted(data.command || `DEL ${detail.name}`);
        setConfirmDeleteOpen(false);
      }
    } finally {
      setDeleting(false);
    }
  };

  const badgeConfig = getTypeBadgeConfig(detail.type);

  return (
    <div className="space-y-4 pb-4 border-b border-slate-800">
      {/* Top row: Name, Badge, Actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            <span>Inspecting Key</span>
            <span className="text-slate-700">•</span>
            <span className="text-slate-400 font-mono text-[11px]">{detail.length} {detail.type === 'string' ? 'bytes' : 'items'}</span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <h2 className="text-base font-mono font-bold text-white truncate max-w-xl select-all" title={detail.name}>
              {detail.name}
            </h2>
            <button
              onClick={copyName}
              title="Copy key name"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Type Badge */}
          <span className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg font-bold border ${badgeConfig.badgeClass}`}>
            {badgeConfig.icon}
            <span>{detail.type.toUpperCase()}</span>
          </span>

          {/* Delete Button */}
          <button
            onClick={() => !isViewer && setConfirmDeleteOpen(true)}
            disabled={isViewer}
            title={isViewer ? 'Viewer accounts have read-only access' : 'Delete this key'}
            className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Metadata Pill Grid */}
      <div className="grid grid-cols-3 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 text-xs font-mono">
        {/* TTL with Edit Popover */}
        <div className="relative">
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-500" />
              TTL
            </span>
            <button
              onClick={() => !isViewer && setTtlPopoverOpen((v) => !v)}
              disabled={isViewer}
              title={isViewer ? 'Read-only' : 'Change TTL'}
              className="text-slate-400 hover:text-emerald-400 text-[10px] flex items-center gap-0.5 disabled:opacity-40"
            >
              <Edit3 className="h-2.5 w-2.5" />
              Edit
            </button>
          </div>
          <span className={`font-bold mt-0.5 block ${currentTtl > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
            {formatTtl(currentTtl).text}
          </span>

          {/* TTL Edit Popover */}
          {ttlPopoverOpen && (
            <div className="absolute top-12 left-0 z-30 w-56 bg-slate-900 border border-slate-750 rounded-xl p-3 shadow-2xl space-y-2.5 text-xs animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between text-slate-300 font-semibold border-b border-slate-800 pb-1.5">
                <span>Set Key TTL</span>
                <button onClick={() => setTtlPopoverOpen(false)} className="text-slate-500 hover:text-slate-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleApplyTtl(60)}
                  disabled={updatingTtl}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono text-center"
                >
                  1 Minute (60s)
                </button>
                <button
                  onClick={() => handleApplyTtl(3600)}
                  disabled={updatingTtl}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono text-center"
                >
                  1 Hour (3600s)
                </button>
                <button
                  onClick={() => handleApplyTtl(86400)}
                  disabled={updatingTtl}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono text-center"
                >
                  1 Day (86400s)
                </button>
                <button
                  onClick={() => handleApplyTtl(-1)}
                  disabled={updatingTtl}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] font-mono text-center"
                >
                  Persist (-1)
                </button>
              </div>

              {/* Custom Seconds Input */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800">
                <input
                  type="number"
                  placeholder="Seconds..."
                  value={customTtl}
                  onChange={(e) => setCustomTtl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => customTtl && handleApplyTtl(parseInt(customTtl, 10))}
                  disabled={!customTtl || updatingTtl}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-40"
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Encoding with InfoTip */}
        <div>
          <div className="flex items-center gap-1 text-slate-500 text-[11px]">
            <span>Encoding</span>
            <InfoTip term={detail.encoding || 'listpack'} />
          </div>
          <span className="text-amber-400 font-bold mt-0.5 block truncate">
            {detail.encoding || 'raw'}
          </span>
        </div>

        {/* Memory Bytes */}
        <div>
          <span className="text-slate-500 block text-[11px]">Approx RAM Size</span>
          <span className="text-blue-400 font-bold mt-0.5 block">
            {formatBytes(detail.memoryBytes)}
          </span>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Key Confirmation</h3>
                <p className="text-xs text-slate-400">This action permanently deletes the key from memory.</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 break-all select-all">
              DEL {detail.name}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
