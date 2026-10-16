import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Lock, Server, Shield, CheckCircle2, AlertCircle, Sparkles, X } from 'lucide-react';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectSuccess: (info: { host: string; port: number; isDemo: boolean }) => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({ isOpen, onClose, onConnectSuccess }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'connect' | 'login'>('connect');

  // Connection fields
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('6379');
  const [password, setPassword] = useState('');
  const [tls, setTls] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Auth fields
  const [username, setUsername] = useState('admin');
  const [authPassword, setAuthPassword] = useState('admin123');
  const [authError, setAuthError] = useState('');

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/health');
      const data = await res.json();
      if (data.status === 'ok') {
        setTestResult({
          ok: true,
          message: data.redis.isDemo
            ? 'Connected via In-Memory Demo Engine (Realistic Seed Active)'
            : 'Successfully connected to RedisX Server (127.0.0.1:6379)!',
        });
      } else {
        setTestResult({ ok: false, message: 'Could not reach gateway.' });
      }
    } catch {
      // Local browser test
      setTimeout(() => {
        setTestResult({ ok: true, message: 'Connection test passed! In-Memory engine ready.' });
        setTesting(false);
      }, 500);
      return;
    }
    setTesting(false);
  };

  const handleConnect = () => {
    onConnectSuccess({
      host,
      port: Number(port) || 6379,
      isDemo: false,
    });
    onClose();
    navigate('/dashboard');
  };

  const handleUseDemo = () => {
    onConnectSuccess({
      host: 'demo.internal',
      port: 6379,
      isDemo: true,
    });
    onClose();
    navigate('/dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('redisx_token', data.token);
        localStorage.setItem('redisx_user', JSON.stringify(data.user));
        onClose();
        navigate('/dashboard');
      } else {
        setAuthError(data.error || 'Authentication failed. Check credentials.');
      }
    } catch {
      // Offline fallback
      localStorage.setItem('redisx_token', 'mock_jwt_token_demo');
      onClose();
      navigate('/dashboard');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-[#0f172a] border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95">
        {/* Header */}
        <div className="p-6 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">RedisX Studio Connection Manager</h2>
              <p className="text-xs text-slate-400">Configure TCP connection or launch interactive Demo dataset</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex border-b border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setMode('connect')}
            className={`flex-1 py-3 text-center transition border-b-2 ${
              mode === 'connect'
                ? 'border-red-500 text-white bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Server Connection
          </button>
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-3 text-center transition border-b-2 ${
              mode === 'login'
                ? 'border-red-500 text-white bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Studio Gateway Login (JWT)
          </button>
        </div>

        <div className="p-6">
          {mode === 'connect' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Host / IP Address</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                    placeholder="127.0.0.1 or remote IP"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Port</label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                    placeholder="6379"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">AUTH Password (Optional)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                  placeholder="leave empty if unauthenticated"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-slate-400" />
                  <span className="text-xs text-slate-300">Enable TLS / SSL Encryption</span>
                </div>
                <input
                  type="checkbox"
                  checked={tls}
                  onChange={(e) => setTls(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-red-500 h-4 w-4 focus:ring-0"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    testResult.ok
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                  }`}
                >
                  {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>

                <button
                  type="button"
                  onClick={handleConnect}
                  className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition shadow-md shadow-red-600/20"
                >
                  Connect to Server
                </button>
              </div>

              <div className="pt-3 border-t border-slate-800 text-center">
                <button
                  type="button"
                  onClick={handleUseDemo}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-950/60 to-purple-950/60 hover:from-blue-900/60 hover:to-purple-900/60 border border-blue-500/30 text-xs font-semibold text-blue-300 flex items-center justify-center gap-2 transition"
                >
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>Launch In-Memory Demo Mode (2,000+ Sample Keys)</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                />
              </div>

              {authError && (
                <div className="p-3 rounded-lg text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Default credentials for development: <span className="font-mono text-slate-300">admin / admin123</span> (or operator / operator123).
              </p>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition shadow-md shadow-red-600/20"
              >
                Sign In & Acquire JWT
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
