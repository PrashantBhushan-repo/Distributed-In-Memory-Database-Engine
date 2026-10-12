import React, { useState, useMemo } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { KeyDetail } from '../types';
import { CommandChip } from '../../../components/CommandChip';

interface SetEditorProps {
  detail: KeyDetail;
  isViewer?: boolean;
  onRefresh: (command?: string) => Promise<void>;
}

export const SetEditor: React.FC<SetEditorProps> = ({
  detail,
  isViewer = false,
  onRefresh,
}) => {
  const [searchMember, setSearchMember] = useState('');
  const [newMember, setNewMember] = useState('');
  const [acting, setActing] = useState(false);
  const [lastCommand, setLastCommand] = useState(`SMEMBERS ${detail.name}`);

  const rawMembers = detail.setMembers || [];

  const filteredMembers = useMemo(() => {
    if (!searchMember.trim()) return rawMembers;
    const q = searchMember.toLowerCase();
    return rawMembers.filter((m) => m.toLowerCase().includes(q));
  }, [rawMembers, searchMember]);

  const handleAddMember = async () => {
    if (!newMember.trim() || isViewer) return;
    setActing(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/set/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: newMember.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewMember('');
        setLastCommand(data.command || `SADD ${detail.name} "${newMember}"`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  const handleRemoveMember = async (member: string) => {
    if (isViewer) return;
    setActing(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/set/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastCommand(data.command || `SREM ${detail.name} "${member}"`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Add Member Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search members..."
            value={searchMember}
            onChange={(e) => setSearchMember(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Add Member Form */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="New member..."
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
            disabled={isViewer}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-purple-500 disabled:opacity-40"
          />
          <button
            onClick={handleAddMember}
            disabled={!newMember.trim() || acting || isViewer}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Set Members Chips Container */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 min-h-48">
        <div className="text-xs text-slate-500 font-mono mb-3">
          Total Members: <span className="text-slate-300 font-bold">{rawMembers.length}</span>
          {searchMember && ` (showing ${filteredMembers.length} matches)`}
        </div>

        {filteredMembers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filteredMembers.map((member) => (
              <span
                key={member}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/40 border border-purple-500/20 text-purple-200 text-xs font-mono group hover:border-purple-500/40 transition-colors select-all"
              >
                <span>{member}</span>
                <button
                  onClick={() => handleRemoveMember(member)}
                  disabled={isViewer || acting}
                  title={isViewer ? 'Read-only' : `Remove '${member}' (SREM)`}
                  className="p-0.5 rounded-full hover:bg-purple-500/30 text-purple-400 hover:text-white transition-colors disabled:opacity-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-xs text-slate-500">
            {searchMember ? 'No matching members found.' : 'Set is empty.'}
          </div>
        )}
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
