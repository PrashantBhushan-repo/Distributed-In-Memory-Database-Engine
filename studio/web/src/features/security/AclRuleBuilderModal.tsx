import React, { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  Shield,
  Layers,
  Copy,
  Check,
  Plus,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
import { AclUserItem, AclRuleObject, AclCategoryInfo } from './types';

interface AclRuleBuilderModalProps {
  user: AclUserItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: AclRuleObject) => Promise<void>;
  categories: AclCategoryInfo[];
}

export const AclRuleBuilderModal: React.FC<AclRuleBuilderModalProps> = ({
  user,
  isOpen,
  onClose,
  onSave,
  categories,
}) => {
  const [username, setUsername] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [nopass, setNopass] = useState(false);
  const [password, setPassword] = useState('');
  const [keys, setKeys] = useState<string[]>(['~*']);
  const [newKey, setNewKey] = useState('');
  const [channels, setChannels] = useState<string[]>(['&*']);
  const [newChannel, setNewChannel] = useState('');

  // Category map: category name -> 'allow' | 'deny' | 'none'
  const [catStates, setCatStates] = useState<Record<string, 'allow' | 'deny' | 'none'>>({});

  // Custom command list
  const [allowedCommands, setAllowedCommands] = useState<string[]>([]);
  const [deniedCommands, setDeniedCommands] = useState<string[]>([]);
  const [newCommand, setNewCommand] = useState('');
  const [newCmdType, setNewCmdType] = useState<'allow' | 'deny'>('allow');

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPassword('');

    if (user) {
      setUsername(user.username);
      setEnabled(user.enabled);
      setNopass(user.isNoPass);
      setKeys(
        user.keysSummary.includes('All keys')
          ? ['~*']
          : user.keysSummary.split(',').map((k) => k.trim())
      );
      setChannels(
        user.channelsSummary.includes('All channels')
          ? ['&*']
          : user.channelsSummary.split(',').map((c) => c.trim())
      );

      const m: Record<string, 'allow' | 'deny' | 'none'> = {};
      user.allowedCategories.forEach((c) => (m[c] = 'allow'));
      user.deniedCategories.forEach((c) => (m[c] = 'deny'));
      setCatStates(m);

      setAllowedCommands([...user.allowedCommands]);
      setDeniedCommands([...user.deniedCommands]);
    } else {
      setUsername('');
      setEnabled(true);
      setNopass(false);
      setKeys(['~*']);
      setChannels(['&*']);
      setCatStates({ read: 'allow', write: 'allow', dangerous: 'deny', admin: 'deny' });
      setAllowedCommands([]);
      setDeniedCommands([]);
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  // Toggle category state: none -> allow -> deny -> none
  const toggleCategory = (cat: string) => {
    const cur = catStates[cat] || 'none';
    const next = cur === 'none' ? 'allow' : cur === 'allow' ? 'deny' : 'none';
    setCatStates({ ...catStates, [cat]: next });
  };

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newKey.trim();
    if (!clean) return;
    const formatted = clean.startsWith('~') ? clean : `~${clean}`;
    if (!keys.includes(formatted)) {
      setKeys([...keys, formatted]);
    }
    setNewKey('');
  };

  const handleRemoveKey = (k: string) => {
    setKeys(keys.filter((item) => item !== k));
  };

  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newChannel.trim();
    if (!clean) return;
    const formatted = clean.startsWith('&') ? clean : `&${clean}`;
    if (!channels.includes(formatted)) {
      setChannels([...channels, formatted]);
    }
    setNewChannel('');
  };

  const handleRemoveChannel = (ch: string) => {
    setChannels(channels.filter((item) => item !== ch));
  };

  const handleAddCustomCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCommand.trim().toUpperCase().replace(/^[+-]/, '');
    if (!clean) return;
    if (newCmdType === 'allow') {
      if (!allowedCommands.includes(clean)) setAllowedCommands([...allowedCommands, clean]);
    } else {
      if (!deniedCommands.includes(clean)) setDeniedCommands([...deniedCommands, clean]);
    }
    setNewCommand('');
  };

  // Build live preview rule string
  const allowedCats = Object.entries(catStates)
    .filter(([_, st]) => st === 'allow')
    .map(([cat]) => cat);
  const deniedCats = Object.entries(catStates)
    .filter(([_, st]) => st === 'deny')
    .map(([cat]) => cat);

  const previewTokens = [
    'user',
    username || '<username>',
    enabled ? 'on' : 'off',
    nopass ? 'nopass' : password ? '>********' : user?.hasPassword ? '#hash' : '',
    ...keys,
    ...channels,
    ...allowedCats.map((c) => `+@${c}`),
    ...deniedCats.map((c) => `-@${c}`),
    ...allowedCommands.map((c) => `+${c}`),
    ...deniedCommands.map((c) => `-${c}`),
  ].filter(Boolean);

  const rulePreview = previewTokens.join(' ');

  const handleCopy = () => {
    navigator.clipboard.writeText(rulePreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username cannot be empty.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        username: username.trim(),
        enabled,
        password: password.trim() || undefined,
        nopass,
        keys,
        channels,
        categories: {
          allowed: allowedCats,
          denied: deniedCats,
        },
        commands: {
          allowed: allowedCommands,
          denied: deniedCommands,
        },
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save ACL rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#0d1322] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {user ? `Edit ACL User: ${user.username}` : 'Create New ACL User'}
              </h2>
              <p className="text-xs text-slate-400">Visual Rule Builder (Never stores plaintext passwords)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Top Bar: Username and Enabled switch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={Boolean(user?.isDefault)}
                required
                placeholder="e.g. app_worker"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono disabled:opacity-50 focus:border-sky-500 focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Account Status</label>
              <div className="flex items-center gap-3 h-[38px]">
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    enabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span>{enabled ? 'Active (on)' : 'Disabled (off)'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Password Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                Authentication Credentials
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={nopass}
                  onChange={(e) => {
                    setNopass(e.target.checked);
                    if (e.target.checked) setPassword('');
                  }}
                  className="rounded border-slate-700 bg-slate-800 text-sky-500"
                />
                <span>Allow without password (nopass)</span>
              </label>
            </div>

            {!nopass && (
              <div className="space-y-1">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    user?.hasPassword
                      ? 'Enter new password to overwrite existing hash (or leave blank to keep)'
                      : 'Enter strong password (stored as SHA-256 hash)'
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:border-sky-500 focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-500">
                  Passwords are sent over encrypted payload and immediately digested into SHA-256 hashes by Redis. Plaintext is never stored.
                </p>
              </div>
            )}
          </div>

          {/* Key Patterns Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <span className="text-xs font-bold text-slate-200">Keyspace Patterns (~pattern)</span>
            <div className="flex flex-wrap gap-1.5">
              {keys.map((k) => (
                <span
                  key={k}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono text-sky-300"
                >
                  <span>{k}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKey(k)}
                    className="text-slate-500 hover:text-red-400 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g. ~cache:* or ~user:*"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:border-sky-500 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddKey}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Add Pattern
              </button>
            </div>
          </div>

          {/* Command Category Toggles Grid */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Command Category Rules (+@cat / -@cat)</span>
              <span className="text-[10px] text-slate-500">Click to cycle: None → Allow → Deny</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.slice(0, 15).map((cat) => {
                const st = catStates[cat.name] || 'none';
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => toggleCategory(cat.name)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs font-mono transition-all text-left ${
                      st === 'allow'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : st === 'deny'
                        ? 'bg-red-500/15 border-red-500/40 text-red-300'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold">@{cat.name}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        st === 'allow'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : st === 'deny'
                          ? 'bg-red-500/20 text-red-300'
                          : 'text-slate-600'
                      }`}
                    >
                      {st === 'allow' ? '+ALLOW' : st === 'deny' ? '-DENY' : 'NONE'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live ACL Rule String Preview */}
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                Live Generated ACL Rule
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-200"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? 'Copied' : 'Copy Rule'}</span>
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 break-all select-all">
              {rulePreview}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Footer controls */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
            >
              <span>{saving ? 'Saving...' : user ? 'Save ACL Changes' : 'Create ACL User'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
