import React, { useState, useMemo } from 'react';
import { Plus, X, Sparkles, AlertCircle } from 'lucide-react';
import { KeyType } from './types';
import { getTypeBadgeConfig } from './formatters';
import { CommandChip } from '../../components/CommandChip';

interface CreateKeyWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyCreated: (name: string) => void;
}

export const CreateKeyWizard: React.FC<CreateKeyWizardProps> = ({
  isOpen,
  onClose,
  onKeyCreated,
}) => {
  const [keyName, setKeyName] = useState('');
  const [keyType, setKeyType] = useState<'string' | 'list' | 'hash' | 'set' | 'zset'>('string');
  const [ttlPreset, setTtlPreset] = useState<'none' | '60' | '3600' | '86400' | 'custom'>('none');
  const [customTtl, setCustomTtl] = useState('');

  // Type-specific values
  const [stringValue, setStringValue] = useState('');
  const [listItems, setListItems] = useState('item1, item2, item3');
  const [hashEntries, setHashEntries] = useState('field1: value1\nfield2: value2');
  const [setMembers, setSetMembers] = useState('member1, member2, member3');
  const [zsetMembers, setZsetMembers] = useState('player1: 100\nplayer2: 250');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ttlSeconds = useMemo(() => {
    if (ttlPreset === 'none') return undefined;
    if (ttlPreset === 'custom') return customTtl ? parseInt(customTtl, 10) : undefined;
    return parseInt(ttlPreset, 10);
  }, [ttlPreset, customTtl]);

  // Preview generated command(s)
  const previewCommand = useMemo(() => {
    const name = keyName.trim() || '<key_name>';
    const ttlClause = ttlSeconds && ttlSeconds > 0 ? ` EX ${ttlSeconds}` : '';

    if (keyType === 'string') {
      const val = stringValue || '<value>';
      return `SET ${name} "${val}"${ttlClause}`;
    }

    if (keyType === 'list') {
      const items = listItems
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const args = items.length > 0 ? items.map((i) => `"${i}"`).join(' ') : '"item1"';
      return `RPUSH ${name} ${args}${ttlSeconds ? ` && EXPIRE ${name} ${ttlSeconds}` : ''}`;
    }

    if (keyType === 'hash') {
      const pairs: string[] = [];
      hashEntries.split('\n').forEach((line) => {
        const [f, v] = line.split(':').map((s) => s.trim());
        if (f && v) pairs.push(`"${f}" "${v}"`);
      });
      const args = pairs.length > 0 ? pairs.join(' ') : '"field1" "value1"';
      return `HSET ${name} ${args}${ttlSeconds ? ` && EXPIRE ${name} ${ttlSeconds}` : ''}`;
    }

    if (keyType === 'set') {
      const members = setMembers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const args = members.length > 0 ? members.map((m) => `"${m}"`).join(' ') : '"member1"';
      return `SADD ${name} ${args}${ttlSeconds ? ` && EXPIRE ${name} ${ttlSeconds}` : ''}`;
    }

    if (keyType === 'zset') {
      const pairs: string[] = [];
      zsetMembers.split('\n').forEach((line) => {
        const [m, s] = line.split(':').map((str) => str.trim());
        if (m && s) pairs.push(`${parseFloat(s) || 0} "${m}"`);
      });
      const args = pairs.length > 0 ? pairs.join(' ') : '100 "player1"';
      return `ZADD ${name} ${args}${ttlSeconds ? ` && EXPIRE ${name} ${ttlSeconds}` : ''}`;
    }

    return '';
  }, [keyName, keyType, ttlSeconds, stringValue, listItems, hashEntries, setMembers, zsetMembers]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      setError('Key name is required');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      let payload: any = {};
      if (keyType === 'string') {
        payload = { value: stringValue };
      } else if (keyType === 'list') {
        payload = {
          items: listItems
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        };
      } else if (keyType === 'hash') {
        const entries: Record<string, string> = {};
        hashEntries.split('\n').forEach((l) => {
          const [f, v] = l.split(':').map((s) => s.trim());
          if (f && v) entries[f] = v;
        });
        payload = { entries };
      } else if (keyType === 'set') {
        payload = {
          members: setMembers
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        };
      } else if (keyType === 'zset') {
        const members: [string, number][] = [];
        zsetMembers.split('\n').forEach((l) => {
          const [m, s] = l.split(':').map((str) => str.trim());
          if (m && s) members.push([m, parseFloat(s) || 0]);
        });
        payload = { members };
      }

      const res = await fetch('/api/keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          type: keyType,
          payload,
          ttl: ttlSeconds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to create key');
      }

      onKeyCreated(keyName.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating key');
    } finally {
      setSubmitting(false);
    }
  };

  const types: Array<'string' | 'list' | 'hash' | 'set' | 'zset'> = [
    'string',
    'list',
    'hash',
    'set',
    'zset',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Create New Database Key</h3>
              <p className="text-xs text-slate-400">Initialize a new key with type, encoding, and optional TTL</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Key Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Key Name</label>
            <input
              type="text"
              placeholder="e.g. user:1001:profile or session:token"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              autoFocus
            />
          </div>

          {/* Type Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Data Type</label>
            <div className="grid grid-cols-5 gap-2">
              {types.map((t) => {
                const conf = getTypeBadgeConfig(t as any);
                const isSelected = keyType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setKeyType(t)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                      isSelected
                        ? `${conf.badgeClass} ring-2 ring-red-500/50 shadow-md`
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {conf.icon}
                    <span>{t.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type Appropriate Inputs */}
          {keyType === 'string' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">String Value</label>
              <textarea
                rows={3}
                placeholder="String or JSON payload..."
                value={stringValue}
                onChange={(e) => setStringValue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              />
            </div>
          )}

          {keyType === 'list' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Initial Items (comma separated)</label>
              <input
                type="text"
                placeholder="task_1, task_2, task_3"
                value={listItems}
                onChange={(e) => setListItems(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              />
            </div>
          )}

          {keyType === 'hash' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Field: Value Pairs (one per line)</label>
              <textarea
                rows={3}
                placeholder="name: Alice\nage: 30\nrole: developer"
                value={hashEntries}
                onChange={(e) => setHashEntries(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              />
            </div>
          )}

          {keyType === 'set' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Set Members (comma separated)</label>
              <input
                type="text"
                placeholder="user_1, user_2, user_3"
                value={setMembers}
                onChange={(e) => setSetMembers(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              />
            </div>
          )}

          {keyType === 'zset' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Member: Score Pairs (one per line)</label>
              <textarea
                rows={3}
                placeholder="player_alex: 100\nplayer_sara: 250"
                value={zsetMembers}
                onChange={(e) => setZsetMembers(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none focus:border-red-500"
              />
            </div>
          )}

          {/* TTL Preset */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Expiration (TTL)</label>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { id: 'none', label: 'No TTL (-1)' },
                { id: '60', label: '1 Min (60s)' },
                { id: '3600', label: '1 Hour' },
                { id: '86400', label: '1 Day' },
                { id: 'custom', label: 'Custom' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTtlPreset(p.id as any)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-mono text-center transition-colors ${
                    ttlPreset === p.id
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-bold'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-850'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {ttlPreset === 'custom' && (
              <input
                type="number"
                placeholder="TTL in seconds..."
                value={customTtl}
                onChange={(e) => setCustomTtl(e.target.value)}
                className="w-full mt-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            )}
          </div>

          {/* Command Preview */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Command Preview
            </span>
            <CommandChip command={previewCommand} />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !keyName.trim()}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
            >
              {submitting ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
