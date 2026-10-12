import React, { useState, useMemo } from 'react';
import { Plus, Trash2, SlidersHorizontal, RotateCcw, X, Search } from 'lucide-react';
import { KeyDetail } from '../types';
import { CommandChip } from '../../../components/CommandChip';

interface ZSetEditorProps {
  detail: KeyDetail;
  isViewer?: boolean;
  onRefresh: (command?: string) => Promise<void>;
}

export const ZSetEditor: React.FC<ZSetEditorProps> = ({
  detail,
  isViewer = false,
  onRefresh,
}) => {
  const [searchMember, setSearchMember] = useState('');
  const [scoreMin, setScoreMin] = useState<string>('');
  const [scoreMax, setScoreMax] = useState<string>('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [newScore, setNewScore] = useState('');
  const [acting, setActing] = useState(false);
  const [lastCommand, setLastCommand] = useState(`ZRANGE ${detail.name} 0 -1 WITHSCORES`);

  const rawMembers = detail.zsetMembers || [];

  const filteredMembers = useMemo(() => {
    return rawMembers.filter((item) => {
      if (searchMember.trim() && !item.member.toLowerCase().includes(searchMember.toLowerCase())) {
        return false;
      }
      if (scoreMin !== '' && item.score < parseFloat(scoreMin)) {
        return false;
      }
      if (scoreMax !== '' && item.score > parseFloat(scoreMax)) {
        return false;
      }
      return true;
    });
  }, [rawMembers, searchMember, scoreMin, scoreMax]);

  const handleAddMember = async () => {
    if (!newMember.trim() || newScore === '' || isViewer) return;
    setActing(true);
    try {
      const scoreNum = parseFloat(newScore);
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/zset/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: newMember.trim(), score: scoreNum }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewMember('');
        setNewScore('');
        setAddDialogOpen(false);
        setLastCommand(data.command || `ZADD ${detail.name} ${scoreNum} "${newMember}"`);
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
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}/zset/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastCommand(data.command || `ZREM ${detail.name} "${member}"`);
        await onRefresh(data.command);
      }
    } finally {
      setActing(false);
    }
  };

  const handleResetFilters = () => {
    setSearchMember('');
    setScoreMin('');
    setScoreMax('');
  };

  const hasActiveFilters = searchMember !== '' || scoreMin !== '' || scoreMax !== '';

  return (
    <div className="space-y-4">
      {/* Filter and Add Toolbar */}
      <div className="space-y-2 border-b border-slate-800 pb-3">
        <div className="flex items-center justify-between gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search members..."
              value={searchMember}
              onChange={(e) => setSearchMember(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Add Member + Score Button */}
          <button
            onClick={() => !isViewer && setAddDialogOpen(true)}
            disabled={isViewer || acting}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Member + Score</span>
          </button>
        </div>

        {/* Score Range Filters */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pt-1">
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <span>Score Range:</span>
          <input
            type="number"
            placeholder="Min score"
            value={scoreMin}
            onChange={(e) => setScoreMin(e.target.value)}
            className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
          />
          <span>to</span>
          <input
            type="number"
            placeholder="Max score"
            value={scoreMax}
            onChange={(e) => setScoreMax(e.target.value)}
            className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
          />
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="p-1 rounded text-slate-500 hover:text-slate-300 flex items-center gap-1 text-[11px]"
              title="Reset filters"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Dialog */}
      {addDialogOpen && (
        <div className="p-3 bg-slate-900 border border-slate-750 rounded-xl space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-semibold text-white">
            <span>Add Sorted Set Member (ZADD)</span>
            <button onClick={() => setAddDialogOpen(false)} className="text-slate-500 hover:text-slate-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Member identifier..."
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
              autoFocus
            />
            <input
              type="number"
              step="any"
              placeholder="Score (e.g. 100 or 98.5)..."
              value={newScore}
              onChange={(e) => setNewScore(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setAddDialogOpen(false)}
              className="px-3 py-1 rounded-lg text-slate-400 hover:text-white text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleAddMember}
              disabled={!newMember.trim() || newScore === '' || acting}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs disabled:opacity-40"
            >
              Add to ZSet
            </button>
          </div>
        </div>
      )}

      {/* Sorted Set Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3 w-16 text-slate-500">#Rank</th>
              <th className="py-2.5 px-3 w-28">Score</th>
              <th className="py-2.5 px-3">Member</th>
              <th className="py-2.5 px-3 w-16 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((row) => (
                <tr key={row.member} className="hover:bg-slate-900/50 transition-colors group">
                  <td className="py-2.5 px-3 text-slate-500 font-bold">#{row.rank}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[11px]">
                      {row.score}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-200 select-all break-all">{row.member}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => handleRemoveMember(row.member)}
                      disabled={isViewer || acting}
                      title={isViewer ? 'Read-only' : `Remove member '${row.member}'`}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">
                  {hasActiveFilters ? 'No members match the filter criteria.' : 'Sorted set is empty.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="text-xs text-slate-500 font-mono">
        Total Items: <span className="text-slate-300 font-bold">{rawMembers.length}</span>
        {hasActiveFilters && ` (filtered: ${filteredMembers.length})`}
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
