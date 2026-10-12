import React, { useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Terminal,
  Shield,
} from 'lucide-react';
import { AclTestResult, AclUserItem } from './types';
import { InfoTip } from '../../components/InfoTip';

interface AclTestPanelProps {
  users: AclUserItem[];
  onTest: (user: string, command: string) => Promise<AclTestResult>;
}

export const AclTestPanel: React.FC<AclTestPanelProps> = ({ users, onTest }) => {
  const [selectedUser, setSelectedUser] = useState(users[0]?.username || 'default');
  const [command, setCommand] = useState('GET cache:101');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AclTestResult | null>(null);

  const QUICK_COMMANDS = [
    'GET cache:101',
    'SET cache:101 "test_value"',
    'KEYS *',
    'FLUSHALL',
    'CONFIG GET maxmemory',
    'DEL user:profile:100',
  ];

  const handleRunTest = async (cmdOverride?: string) => {
    const cmd = cmdOverride || command;
    if (!cmd.trim()) return;
    setLoading(true);
    try {
      const res = await onTest(selectedUser, cmd.trim());
      setResult(res);
    } catch (err: any) {
      setResult({
        user: selectedUser,
        command: cmd,
        allowed: false,
        reason: err.message || 'Evaluation failed',
        decidingRule: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">ACL Permission Simulator (ACL DRYRUN)</h3>
          <InfoTip content="Validates if a specific user credentials payload would be authorized to execute a command against the Redis engine without actually modifying data." />
        </div>
        <div className="text-xs text-slate-400 font-mono">
          Simulate without state mutations
        </div>
      </div>

      {/* Simulator Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Target User</label>
          <select
            value={selectedUser}
            onChange={(e) => {
              setSelectedUser(e.target.value);
              setResult(null);
            }}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:border-sky-500 focus:outline-hidden"
          >
            {users.map((u) => (
              <option key={u.username} value={u.username}>
                {u.username} ({u.enabled ? 'on' : 'off'})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 space-y-1">
          <label className="text-xs font-semibold text-slate-300">Test Command String</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. KEYS * or SET cache:item 123"
              className="flex-1 px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:border-sky-500 focus:outline-hidden"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRunTest();
                }
              }}
            />
            <button
              onClick={() => handleRunTest()}
              disabled={loading || !command.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors shadow-xs"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{loading ? 'Evaluating...' : 'Test Permission'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick preset commands */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-slate-500 font-mono mr-1">Quick presets:</span>
        {QUICK_COMMANDS.map((qc) => (
          <button
            key={qc}
            onClick={() => {
              setCommand(qc);
              handleRunTest(qc);
            }}
            className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
          >
            {qc}
          </button>
        ))}
      </div>

      {/* Test Evaluation Result Banner */}
      {result && (
        <div
          className={`rounded-xl border p-4 transition-all duration-200 ${
            result.allowed
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {result.allowed ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/20 text-red-400">
                  <XCircle className="h-5 w-5" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-bold tracking-wider ${
                      result.allowed ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {result.allowed ? 'PERMISSION ALLOWED' : 'EXECUTION DENIED'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    for user <strong className="text-white">{result.user}</strong>
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">{result.reason}</p>
              </div>
            </div>

            <div className="rounded-lg bg-slate-950/80 px-3 py-1.5 border border-slate-800 text-[11px] font-mono text-slate-400">
              Deciding Rule: <code className="text-white font-bold">{result.decidingRule}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
