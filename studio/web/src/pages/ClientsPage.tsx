import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { ClientInfo, ClientsSummary } from '../features/clients/types';
import { ClientSummaryStrip } from '../features/clients/ClientSummaryStrip';
import { ClientsTable } from '../features/clients/ClientsTable';
import { KillClientModal } from '../features/clients/KillClientModal';
import { RenameClientModal } from '../features/clients/RenameClientModal';

export const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [summary, setSummary] = useState<ClientsSummary>({
    total: 0,
    blockedCount: 0,
    subscribedCount: 0,
    maxClients: 10000,
    highBufferCount: 0,
    highIdleCount: 0,
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [killTarget, setKillTarget] = useState<ClientInfo | null>(null);
  const [renameTarget, setRenameTarget] = useState<ClientInfo | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/clients', { headers });
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
        setSummary({
          total: data.total || 0,
          blockedCount: data.blockedCount || 0,
          subscribedCount: data.subscribedCount || 0,
          maxClients: data.maxClients || 10000,
          highBufferCount: data.highBufferCount || 0,
          highIdleCount: data.highIdleCount || 0,
        });
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // 5-second auto refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchClients, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchClients]);

  // Actions
  const handleKill = async (id: string) => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/clients/${id}/kill`, {
      method: 'POST',
      headers,
    });
    if (res.ok) {
      await fetchClients();
    }
  };

  const handleRename = async (id: string, newName: string) => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/clients/${id}/name`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      await fetchClients();
    }
  };

  return (
    <div className="flex-1 space-y-5 p-6 bg-[#070b14] text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide">
                Client Connections Manager
              </h1>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-slate-700">
                127.0.0.1:6379
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Active TCP sockets, buffer telemetry, idle timeouts, and connection termination
            </p>
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      <ClientSummaryStrip summary={summary} />

      {/* Clients Table */}
      <ClientsTable
        clients={clients}
        isAutoRefreshActive={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        onManualRefresh={fetchClients}
        onKillClient={(c) => setKillTarget(c)}
        onRenameClient={(c) => setRenameTarget(c)}
      />

      {/* Kill Modal */}
      <KillClientModal
        client={killTarget}
        isOpen={killTarget !== null}
        onClose={() => setKillTarget(null)}
        onConfirmed={handleKill}
      />

      {/* Rename Modal */}
      <RenameClientModal
        client={renameTarget}
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        onRenamed={handleRename}
      />
    </div>
  );
};
