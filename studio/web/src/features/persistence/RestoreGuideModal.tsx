import React, { useState } from 'react';
import {
  X,
  HelpCircle,
  Database,
  FileText,
  Copy,
  Check,
  Terminal,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface RestoreGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RestoreGuideModal: React.FC<RestoreGuideModalProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<'rdb' | 'aof'>('rdb');
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  if (!isOpen) return null;

  const copyCommand = (cmd: string, stepIdx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedStep(stepIdx);
    setTimeout(() => setCopiedStep(null), 1500);
  };

  const RDB_STEPS = [
    {
      title: '1. Safely Shutdown the Running Redis Server',
      desc: 'Never overwrite dump.rdb while Redis is running, or the server will overwrite your backup with a dirty shutdown snapshot.',
      cmd: 'redis-cli shutdown nosave',
    },
    {
      title: '2. Identify the Configured Working Directory',
      desc: 'Verify where Redis expects dump.rdb to reside (default is /var/lib/redis or the startup directory).',
      cmd: 'redis-cli config get dir\n# Expected output: 1) "dir" 2) "/var/lib/redis"',
    },
    {
      title: '3. Copy Backup Snapshot to Working Directory',
      desc: 'Place your snapshot file into the directory and ensure correct filesystem ownership.',
      cmd: 'cp /backups/dump-2026-10-12.rdb /var/lib/redis/dump.rdb\nchown redis:redis /var/lib/redis/dump.rdb\nchmod 644 /var/lib/redis/dump.rdb',
    },
    {
      title: '4. Start Redis and Monitor Startup Log',
      desc: 'Redis automatically parses and loads dump.rdb into RAM during boot.',
      cmd: 'systemctl start redis-server\njournalctl -u redis-server -f | grep -i "rdb"',
    },
    {
      title: '5. Verify Keyspace Restored',
      desc: 'Connect via CLI or RedisX Studio Console to verify the key count matches expectation.',
      cmd: 'redis-cli dbsize',
    },
  ];

  const AOF_STEPS = [
    {
      title: '1. Check and Repair AOF Integrity (Optional)',
      desc: 'If Redis crashed unexpectedly, scan and fix incomplete trailing transactions with redis-check-aof.',
      cmd: 'redis-check-aof --fix /var/lib/redis/appendonlydir/appendonly.aof.manifest',
    },
    {
      title: '2. Stop Server and Place AOF Directory',
      desc: 'Redis 7+ uses Multi-Part AOF (base + incremental files inside appendonlydir).',
      cmd: 'redis-cli shutdown nosave\ncp -r /backups/appendonlydir /var/lib/redis/\nchown -R redis:redis /var/lib/redis/appendonlydir',
    },
    {
      title: '3. Ensure appendonly is Enabled in Configuration',
      desc: 'Verify redis.conf has "appendonly yes" enabled so it loads the AOF instead of RDB.',
      cmd: 'grep -E "^appendonly " /etc/redis/redis.conf\n# appendonly yes',
    },
    {
      title: '4. Start Redis and Verify Stream Replay',
      desc: 'Redis will reconstruct the exact state by sequentially executing operations.',
      cmd: 'systemctl start redis-server\nredis-cli info persistence',
    },
  ];

  const steps = tab === 'rdb' ? RDB_STEPS : AOF_STEPS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#0d1322] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">How to Restore Redis Backups</h2>
              <p className="text-xs text-slate-400">Step-by-step production restore procedures</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-3 gap-4">
          <button
            onClick={() => setTab('rdb')}
            className={`flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              tab === 'rdb'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>Restore from RDB Snapshot (dump.rdb)</span>
          </button>

          <button
            onClick={() => setTab('aof')}
            className={`flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              tab === 'aof'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Restore from AOF (Multi-Part AOF)</span>
          </button>
        </div>

        {/* Scrollable steps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {steps.map((st, idx) => (
            <div key={idx} className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">{st.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{st.desc}</p>
                </div>
              </div>

              <div className="relative rounded-lg bg-slate-950 border border-slate-800/80 p-3 font-mono text-xs text-emerald-400 group">
                <pre className="whitespace-pre-wrap">{st.cmd}</pre>
                <button
                  onClick={() => copyCommand(st.cmd, idx)}
                  className="absolute right-2 top-2 p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Copy command"
                >
                  {copiedStep === idx ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              <strong>Crucial Notice:</strong> If both AOF and RDB are present in the working directory when Redis starts, Redis will always load the <strong>AOF</strong> by default because it is guaranteed to have the most up-to-date dataset.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-6 py-3.5 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
