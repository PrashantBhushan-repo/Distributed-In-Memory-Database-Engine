import React, { useState, useEffect, useCallback } from 'react';
import { Sliders, RefreshCw, AlertTriangle, RotateCcw, CheckCircle2 } from 'lucide-react';
import { ConfigParamItem, ConfigRollbackResult } from '../features/config/types';
import { ConfigParamsTable } from '../features/config/ConfigParamsTable';
import { ConfigConfirmModal } from '../features/config/ConfigConfirmModal';
import { ConfigExportModal } from '../features/config/ConfigExportModal';

export const ConfigPage: React.FC = () => {
  const [params, setParams] = useState<ConfigParamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [editingParam, setEditingParam] = useState<ConfigParamItem | null>(null);
  const [draftValue, setDraftValue] = useState<any>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Rollback Toast
  const [rollbackToast, setRollbackToast] = useState<{
    param: string;
    prevVal: any;
    newVal: any;
  } | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/config', { headers });
      if (res.ok) {
        const data = await res.json();
        setParams(data || []);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to fetch configuration');
      }
    } catch (err: any) {
      console.error('Error fetching config:', err);
      setError(err.message || 'Network error fetching configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleTriggerEdit = (param: ConfigParamItem, newValue: any) => {
    setEditingParam(param);
    setDraftValue(newValue);
  };

  const handleConfirmUpdate = async (param: string, value: any, unlock: boolean) => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/config', {
      method: 'POST',
      headers,
      body: JSON.stringify({ parameter: param, value, unlock }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update configuration parameter');
    }

    const data = await res.json();
    setRollbackToast({
      param: data.parameter,
      prevVal: data.previousValue,
      newVal: data.newValue,
    });

    await fetchConfig();
  };

  const handleRollback = async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/config/rollback', {
        method: 'POST',
        headers,
      });

      if (res.ok) {
        setRollbackToast(null);
        await fetchConfig();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to rollback parameter');
      }
    } catch (err: any) {
      alert(err.message || 'Error executing rollback');
    }
  };

  if (loading && params.length === 0) {
    return (
      <div className="flex-1 p-8 bg-[#070b14] text-slate-100 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-sky-400" />
          <span>Reading server configuration parameters...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 bg-[#070b14] text-slate-100 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Runtime Server Configuration</h1>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 border border-slate-700">
                {params.length} parameters
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Inspect and dynamically configure server parameters, memory thresholds, and durability flags
            </p>
          </div>
        </div>

        <button
          onClick={fetchConfig}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Undo / Rollback Toast Banner */}
      {rollbackToast && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>
              Updated <strong className="font-mono text-white">{rollbackToast.param}</strong> to{' '}
              <strong className="font-mono text-white">
                {rollbackToast.param === 'requirepass' ? '********' : String(rollbackToast.newVal)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRollback}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Undo (Rollback)</span>
            </button>
            <button
              onClick={() => setRollbackToast(null)}
              className="text-emerald-400 hover:text-white font-bold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Parameters Table */}
      <ConfigParamsTable
        params={params}
        onTriggerEdit={handleTriggerEdit}
        onOpenExport={() => setIsExportOpen(true)}
      />

      {/* Confirmation Modal */}
      <ConfigConfirmModal
        param={editingParam}
        newValue={draftValue}
        isOpen={Boolean(editingParam)}
        onClose={() => setEditingParam(null)}
        onConfirm={handleConfirmUpdate}
      />

      {/* Export redis.conf Modal */}
      <ConfigExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
};
