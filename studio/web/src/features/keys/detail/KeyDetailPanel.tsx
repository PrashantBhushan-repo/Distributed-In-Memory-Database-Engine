import React, { useState, useEffect, useCallback } from 'react';
import { Database, AlertCircle, RefreshCw, CheckCircle2, X } from 'lucide-react';
import { KeyDetail } from '../types';
import { KeyDetailHeader } from './KeyDetailHeader';
import { StringEditor } from './StringEditor';
import { ListEditor } from './ListEditor';
import { HashEditor } from './HashEditor';
import { SetEditor } from './SetEditor';
import { ZSetEditor } from './ZSetEditor';
import { CommandChip } from '../../../components/CommandChip';

interface KeyDetailPanelProps {
  keyName: string | null;
  isViewer?: boolean;
  onKeyDeleted: () => void;
  onKeyUpdated: () => void;
}

export const KeyDetailPanel: React.FC<KeyDetailPanelProps> = ({
  keyName,
  isViewer = false,
  onKeyDeleted,
  onKeyUpdated,
}) => {
  const [detail, setDetail] = useState<KeyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; command?: string } | null>(null);

  const fetchKeyDetail = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(name)}`);
      if (res.status === 404) {
        setNotFound(true);
        setDetail(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load key '${name}'`);
      }
      const data = await res.json();
      setDetail(data);
    } catch (err: any) {
      setError(err.message || 'Error loading key details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (keyName) {
      fetchKeyDetail(keyName);
    } else {
      setDetail(null);
      setNotFound(false);
      setError(null);
    }
  }, [keyName, fetchKeyDetail]);

  const showToast = (text: string, command?: string) => {
    setToastMessage({ text, command });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleTtlUpdated = async (newTtl: number, command: string) => {
    showToast(`TTL updated successfully`, command);
    if (detail) {
      setDetail({ ...detail, ttl: newTtl });
    }
    onKeyUpdated();
  };

  const handleKeyDeleted = async (command: string) => {
    showToast(`Key deleted from database`, command);
    setDetail(null);
    onKeyDeleted();
  };

  const handleStringSaved = async (newValue: string, command: string) => {
    showToast(`String value updated`, command);
    if (detail) {
      setDetail({ ...detail, value: newValue, length: newValue.length });
    }
    onKeyUpdated();
  };

  const handleCollectionRefresh = async (command?: string) => {
    if (command) {
      showToast(`Command executed successfully`, command);
    }
    if (keyName) {
      await fetchKeyDetail(keyName);
    }
    onKeyUpdated();
  };

  if (!keyName) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
        <div className="h-12 w-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
          <Database className="h-6 w-6 text-slate-600" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-300">Select a Key to Inspect</h4>
          <p className="text-xs text-slate-500 max-w-xs mt-1">
            Click any key on the left to examine its type, internal memory encoding, size, and live TTL countdown.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 bg-slate-800 rounded-lg w-1/3" />
        <div className="h-16 bg-slate-900 rounded-xl" />
        <div className="h-48 bg-slate-900 rounded-xl" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-white">This key no longer exists</h4>
          <p className="text-xs text-slate-400 max-w-sm">
            Key <span className="font-mono text-amber-300 font-bold">{keyName}</span> could not be found. It may have expired or been deleted by another client.
          </p>
        </div>
        <button
          onClick={onKeyDeleted}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Key List</span>
        </button>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
        <div className="h-12 w-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">Error Loading Key</h4>
          <p className="text-xs text-slate-400 max-w-xs mt-1">{error || 'Unable to fetch key'}</p>
        </div>
        <button
          onClick={() => fetchKeyDetail(keyName)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 h-full overflow-y-auto">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{toastMessage.text}</span>
            {toastMessage.command && (
              <span className="font-mono text-[11px] bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/20">
                {toastMessage.command}
              </span>
            )}
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <KeyDetailHeader
        detail={detail}
        isViewer={isViewer}
        onTtlUpdated={handleTtlUpdated}
        onKeyDeleted={handleKeyDeleted}
      />

      {/* Type-Specific Body */}
      {detail.type === 'string' && (
        <StringEditor detail={detail} isViewer={isViewer} onSave={handleStringSaved} />
      )}

      {detail.type === 'list' && (
        <ListEditor detail={detail} isViewer={isViewer} onRefresh={handleCollectionRefresh} />
      )}

      {detail.type === 'hash' && (
        <HashEditor detail={detail} isViewer={isViewer} onRefresh={handleCollectionRefresh} />
      )}

      {detail.type === 'set' && (
        <SetEditor detail={detail} isViewer={isViewer} onRefresh={handleCollectionRefresh} />
      )}

      {detail.type === 'zset' && (
        <ZSetEditor detail={detail} isViewer={isViewer} onRefresh={handleCollectionRefresh} />
      )}
    </div>
  );
};
