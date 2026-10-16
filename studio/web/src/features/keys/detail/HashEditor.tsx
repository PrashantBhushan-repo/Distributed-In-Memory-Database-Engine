import React, { useState, useMemo } from 'react';
import { Search, Plus, Trash2, Save, X, Edit2, Check } from 'lucide-react';
import { KeyDetail } from '../types';
import { CommandChip } from '../../../components/CommandChip';

interface HashEditorProps {
  detail: KeyDetail;
  isViewer?: boolean;
  onRefresh: (command?: string) => Promise<void>;
}

export const HashEditor: React.FC<HashEditorProps> = ({
  detail,
  isViewer = false,
  onRefresh,
}) => {
  const [searchField, setSearchField] = useState('');
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [acting, setActing] = useState(false);
  const [lastCommand, setLastCommand] = useState(`HGETALL ${detail.name}`);

  const rawEntries = detail.hashEntries || [];

  const filteredEntries = useMemo(() => {
    if (!searchField.trim()) return rawEntries;
    const q = searchField.toLowerCase();
    return rawEntries.filter((e) => e.field.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }, [rawEntries, searchField]);

  const handleAddField = async () => {
    if (!newFieldName.trim() || isViewer) return;
    setActing(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/hash/field`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: newFieldName.trim(), value: newFieldValue }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewFieldName('');
        setNewFieldValue('');
        setNewFieldOpen(false);
        setLastCommand(data.command || `HSET ${detail.name} "${newFieldName}" "${newFieldValue}"`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  const handleSaveFieldEdit = async (field: string) => {
    if (isViewer) return;
    setActing(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/hash/field`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value: editValue }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingField(null);
        setLastCommand(data.command || `HSET ${detail.name} "${field}" "${editValue}"`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  const handleDeleteField = async (field: string) => {
    if (isViewer) return;
    setActing(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/hash/field`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastCommand(data.command || `HDEL ${detail.name} "${field}"`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Add Field Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        {/* Field Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search fields or values..."
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
          />
        </div>

        {/* Add Field Button */}
        <button
          onClick={() => !isViewer && setNewFieldOpen(true)}
          disabled={isViewer || acting}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Field</span>
        </button>
      </div>

      {/* Inline Add Field Form */}
      {newFieldOpen && (
        <div className="p-3 bg-slate-900 border border-slate-750 rounded-xl space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-semibold text-white">
            <span>Add New Hash Field (HSET)</span>
            <button onClick={() => setNewFieldOpen(false)} className="text-slate-500 hover:text-slate-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Field name..."
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              autoFocus
            />
            <input
              type="text"
              placeholder="Field value..."
              value={newFieldValue}
              onChange={(e) => setNewFieldValue(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setNewFieldOpen(false)}
              className="px-3 py-1 rounded-lg text-slate-400 hover:text-white text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleAddField}
              disabled={!newFieldName.trim() || acting}
              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs disabled:opacity-40"
            >
              Add Field
            </button>
          </div>
        </div>
      )}

      {/* Fields Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3 w-1/3 text-slate-400">Field</th>
              <th className="py-2.5 px-3">Value</th>
              <th className="py-2.5 px-3 w-20 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {filteredEntries.length > 0 ? (
              filteredEntries.map((row) => {
                const isEditing = editingField === row.field;
                return (
                  <tr key={row.field} className="hover:bg-slate-900/50 transition-colors group">
                    <td className="py-2.5 px-3 font-bold text-amber-400 select-all break-all">{row.field}</td>
                    <td className="py-2.5 px-3 text-slate-200 break-all select-all">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveFieldEdit(row.field)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs w-full focus:outline-none focus:border-emerald-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveFieldEdit(row.field)}
                            disabled={acting}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                            title="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingField(null)}
                            className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        row.value
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {!isEditing && (
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              if (!isViewer) {
                                setEditingField(row.field);
                                setEditValue(row.value);
                              }
                            }}
                            disabled={isViewer || acting}
                            title={isViewer ? 'Read-only' : 'Edit field value'}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-0"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteField(row.field)}
                            disabled={isViewer || acting}
                            title={isViewer ? 'Read-only' : 'Delete field'}
                            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3} className="py-6 text-center text-slate-500">
                  {searchField ? 'No matching fields found.' : 'Hash is empty.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
