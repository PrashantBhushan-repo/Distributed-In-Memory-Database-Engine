import React, { useEffect, useState } from 'react';
import { ArrowRight, Database, Loader2, ShieldCheck } from 'lucide-react';

export function SessionGate({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('redisx_token'));
  const [checking, setChecking] = useState(true);
  const [playground, setPlayground] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [gatewayError, setGatewayError] = useState('');
  const [healthAttempt, setHealthAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let request: AbortController;
    let retry: ReturnType<typeof setTimeout>;
    const check = async () => {
      request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 5000);
      try {
        const response = await fetch('/health', { signal: request.signal });
        if (!response.ok) throw new Error('Gateway unavailable');
        const health = await response.json();
        if (!['open', 'playground', 'authenticated'].includes(health.accessMode)) throw new Error('Gateway not ready');
        if (disposed) return;
        if (health.accessMode === 'playground' || health.accessMode === 'open') {
          localStorage.removeItem('redisx_token');
          localStorage.setItem('redisx_user', JSON.stringify({ username: health.accessMode === 'open' ? 'Studio Explorer' : 'Local Explorer', role: 'admin', accessMode: health.accessMode }));
          setToken(null); setPlayground(true);
        } else setPlayground(false);
        setGatewayError(''); setChecking(false);
      } catch {
        if (!disposed) {
          setGatewayError('Waiting for the gateway. Reconnecting automatically…');
          retry = setTimeout(() => void check(), 1500);
        }
      } finally { clearTimeout(timeout); }
    };
    void check();
    return () => { disposed = true; clearTimeout(retry); request?.abort(); };
  }, [healthAttempt]);
  useEffect(() => {
    const expired = () => {
      localStorage.removeItem('redisx_token'); localStorage.removeItem('redisx_user');
      setToken(null); setPlayground(false); setChecking(true);
      setError('Your session has expired. Sign in to continue.');
      setHealthAttempt(attempt => attempt + 1);
    };
    window.addEventListener('redisx:unauthorized', expired);
    return () => window.removeEventListener('redisx:unauthorized', expired);
  }, []);
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const result = await response.json();
      if (!response.ok || !result.token) throw new Error(result.error ?? 'Could not sign in. Check your credentials.');
      localStorage.setItem('redisx_token', result.token); localStorage.setItem('redisx_user', JSON.stringify(result.user));
      setPassword(''); setToken(result.token);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The gateway is unavailable. Start it and try again.'); }
    finally { setPending(false); }
  };
  if (checking) return <div className="studio-login items-center justify-center" role="status">{gatewayError || 'Opening workspace…'}</div>;
  if (playground || token) return <>{children}</>;
  return <div className="studio-login">
    <a href="/" className="studio-wordmark"><Database size={23} /> RedisX <span>STUDIO</span></a>
    <div className="studio-login-grid"><section className="studio-login-intro">
      <div className="studio-eyebrow">YOUR DATABASE, IN FOCUS</div>
      <h1>A clearer view of<br />what’s happening.</h1>
      <p>Explore your keys. Understand your workload. Work directly with your RedisX engine, from one considered workspace.</p>
      <div className="studio-login-note"><ShieldCheck size={18} /><span>Role based access · Verified engine readings · Explicit write controls</span></div>
    </section><form className="studio-login-form" onSubmit={login}>
      <div className="studio-eyebrow">WELCOME BACK</div><h2>Sign in to Studio</h2><p>Use your gateway account to access the workspace.</p>
      <label htmlFor="studio-username">Username</label><input id="studio-username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
      <label htmlFor="studio-password">Password</label><input id="studio-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
      {error && <p className="studio-form-error" role="alert">{error}</p>}
      <button className="studio-primary" disabled={pending}>{pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} {pending ? 'Signing in…' : 'Open workspace'}</button>
      <small>Accounts are configured by your gateway administrator.</small>
    </form></div><footer>RedisX Studio <span>Built for the details.</span></footer>
  </div>;
}
