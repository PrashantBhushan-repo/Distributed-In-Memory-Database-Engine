import React, { useEffect, useRef, useState } from 'react';
import { Database, X, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
interface Props {
  isOpen: boolean; onClose: () => void;
  onConnectSuccess: (info: { host: string; port: number; isDemo: boolean }) => void;
}
export function ConnectModal({ isOpen, onClose, onConnectSuccess }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('6379');
  const [password, setPassword] = useState('');
  const [tls, setTls] = useState(false);
  const [pending, setPending] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    dialog.current?.showModal();
    const abort = new AbortController();
    fetch('/api/capabilities', { signal: abort.signal }).then(r => r.json()).then(data => {
      if (!abort.signal.aborted && data.host) { setHost(data.host); setPort(String(data.port)); setTls(data.tlsEnabled === true); setResult(null); }
    }).catch(() => {});
    return () => { abort.abort(); dialog.current?.close(); };
  }, [isOpen]);
  const run = async (action: 'test' | 'connect' | 'demo') => {
    setPending(action); setResult(null);
    try {
      const response = await fetch(`/api/connection/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'demo' ? {} : { host, port: Number(port), password, tls }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Connection failed. Check the engine configuration.');
      if (action === 'test') setResult({ ok: true, text: `PONG received from ${host}:${port} in ${data.latencyMs} ms.` });
      else { localStorage.setItem('redisx_db', '0'); onConnectSuccess({ host: data.host, port: data.port, isDemo: data.isDemo }); onClose(); window.location.reload(); }
    } catch (error) { setResult({ ok: false, text: error instanceof Error ? error.message : 'The gateway is unavailable.' }); }
    finally { setPending(''); }
  };
  return <dialog ref={dialog} className="studio-dialog" onCancel={onClose} aria-labelledby="connection-title">
    <header><div className="studio-section-label"><Database size={18} /> CONNECTION</div><button onClick={onClose} className="studio-icon-button" aria-label="Close connection settings"><X size={18} /></button></header>
    <h2 id="connection-title">Connect your engine</h2><p>Studio communicates with your C++ engine over RESP. This connection is shared by gateway users.</p>
    <form onSubmit={event => { event.preventDefault(); void run('connect'); }}>
      <div className="studio-connection-fields"><label>Host<input required value={host} onChange={e => { setHost(e.target.value); setResult(null); }} /></label>
      <label>Port<input type="number" min="1" max="65535" required value={port} onChange={e => { setPort(e.target.value); setResult(null); }} /></label></div>
      <label>Database password<input type="password" autoComplete="off" value={password} onChange={e => { setPassword(e.target.value); setResult(null); }} placeholder="Leave empty if authentication is disabled" /></label>
      <label className="studio-checkbox"><input type="checkbox" checked={tls} onChange={e => setTls(e.target.checked)} />Use TLS encryption</label>
      {result && <div role="status" className={result.ok ? 'studio-form-success' : 'studio-form-error'}>{result.ok && <CheckCircle2 size={16} />}{result.text}</div>}
      <div className="studio-dialog-actions"><button type="button" className="studio-secondary" disabled={!!pending} onClick={() => void run('test')}>{pending === 'test' ? 'Testing…' : 'Test connection'}</button>
      <button className="studio-primary" disabled={!!pending}>{pending === 'connect' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} Connect engine</button></div>
    </form><div className="studio-demo-option"><div><strong>Just exploring?</strong><p>Switch to a clearly labeled sample dataset.</p></div><button className="studio-secondary" disabled={!!pending} onClick={() => void run('demo')}>Use demo</button></div>
  </dialog>;
}
