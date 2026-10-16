import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Trash2, Plus, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react';
import { KeyDetail } from '../types';
import { CommandChip } from '../../../components/CommandChip';

interface ListEditorProps {
  detail: KeyDetail;
  isViewer?: boolean;
  onRefresh: (command?: string) => Promise<void>;
}

export const ListEditor: React.FC<ListEditorProps> = ({
  detail,
  isViewer = false,
  onRefresh,
}) => {
  const [pushDialogOpen, setPushDialogOpen] = useState<'left' | 'right' | null>(null);
  const [pushValue, setPushValue] = useState('');
  const [acting, setActing] = useState(false);
  const [currentPage, setCurrentPage] = useState(detail.listPage?.page || 1);
  const [lastCommand, setLastCommand] = useState<string>(`LRANGE ${detail.name} 0 49`);

  const items = detail.listItems || [];
  const total = detail.listPage?.total ?? items.length;
  const limit = detail.listPage?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handlePush = async () => {
    if (!pushDialogOpen || !pushValue.trim() || isViewer) return;
    setActing(true);
    try {
      const direction = pushDialogOpen;
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/list/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, value: pushValue.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setPushValue('');
        setPushDialogOpen(null);
        setLastCommand(data.command || `${direction === 'left' ? 'LPUSH' : 'RPUSH'} ${detail.name} "${pushValue}"`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  const handlePop = async (direction: 'left' | 'right') => {
    if (isViewer) return;
    setActing(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/list/pop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastCommand(data.command || `${direction === 'left' ? 'LPOP' : 'RPOP'} ${detail.name}`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  const handleDeleteIndex = async (index: number) => {
    if (isViewer) return;
    setActing(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/list/index/${index}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setLastCommand(data.command || `LREM ${detail.name} 1 ...`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* List Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {/* Push Left */}
          <button
            onClick={() => !isViewer && setPushDialogOpen('left')}
            disabled={isViewer || acting}
            className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-750 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-blue-400" />
            <span>Push Left (LPUSH)</span>
          </button>

          {/* Push Right */}
          <button
            onClick={() => !isViewer && setPushDialogOpen('right')}
            disabled={isViewer || acting}
            className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-750 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            <span>Push Right (RPUSH)</span>
            <ArrowRight className="h-3.5 w-3.5 text-emerald-400" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Pop Left */}
          <button
            onClick={() => handlePop('left')}
            disabled={isViewer || acting || items.length === 0}
            className="px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold flex items-center gap-1 disabled:opacity-30"
          >
            <span>LPOP</span>
          </button>

          {/* Pop Right */}
          <button
            onClick={() => handlePop('right')}
            disabled={isViewer || acting || items.length === 0}
            className="px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold flex items-center gap-1 disabled:opacity-30"
          >
            <span>RPOP</span>
          </button>
        </div>
      </div>

      {/* Push Dialog Modal */}
      {pushDialogOpen && (
        <div className="p-3 bg-slate-900 border border-slate-750 rounded-xl space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-semibold text-white">
            <span>{pushDialogOpen === 'left' ? 'Push Element Left (LPUSH)' : 'Push Element Right (RPUSH)'}</span>
            <button onClick={() => setPushDialogOpen(null)} className="text-slate-500 hover:text-slate-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Value to push..."
              value={pushValue}
              onChange={(e) => setPushValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePush()}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              autoFocus
            />
            <button
              onClick={handlePush}
              disabled={!pushValue.trim() || acting}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs disabled:opacity-40"
            >
              Push
            </button>
          </div>
        </div>
      )}

      {/* Ordered List Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3 w-16 text-slate-500">#Index</th>
              <th className="py-2.5 px-3">Value</th>
              <th className="py-2.5 px-3 w-16 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {items.length > 0 ? (
              items.map((row) => (
                <tr key={row.index} className="hover:bg-slate-900/50 transition-colors group">
                  <td className="py-2 px-3 text-slate-500">{row.index}</td>
                  <td className="py-2 px-3 text-slate-200 break-all select-all">{row.value}</td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleDeleteIndex(row.index)}
                      disabled={isViewer || acting}
                      title={isViewer ? 'Read-only' : 'Delete this item'}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-6 text-center text-slate-500">
                  List is empty. Use Push Left or Push Right to insert elements.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
        <span>
          Showing {items.length > 0 ? `${(currentPage - 1) * limit + 1}-${Math.min(currentPage * limit, total)}` : 0} of {total} items
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-slate-300">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Equivalent CLI Command */}
      <div className="space-y-1.5 pt-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Equivalent RESP Command
        </span>
        <CommandChip command={lastCommand} />
      </div>
    </div>
  );
};
