import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUpRight, CheckCircle2, AlertTriangle, Database, Terminal, ArrowRight, Server, Clock, HardDrive, Users, Zap } from 'lucide-react';
import { useMetrics } from '../features/metrics/MetricsContext';
import { Sparkline } from '../components/Sparkline';
import { InfoTip } from '../components/InfoTip';

interface ServerInfo {
  server: { redis_version: string; uptime_in_seconds: number; process_id?: number; redis_mode?: string; os?: string; tcp_port: number };
  replication: { role: string };
  memory: { maxmemory_policy: string };
  keyspace: Record<string, { keys: number; expires: number }>;
}
function bytes(value: number) { return value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`; }
function uptime(value: number) { const days = Math.floor(value / 86400); const hours = Math.floor(value / 3600) % 24; const minutes = Math.floor(value / 60) % 60; return `${days ? `${days}d ` : ''}${hours}h ${minutes}m`; }

export const DashboardPage: React.FC = () => {
  const { latestSample: sample, history, healthSummary, engine, stale, hasSample } = useMetrics();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [range, setRange] = useState<'15m' | '1h'>('1h');
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      try { const response = await fetch('/api/info', { signal: abort.signal }); if (!response.ok) throw new Error(); const data = await response.json(); if (!abort.signal.aborted) { setInfo(data); setInfoError(false); } }
      catch { if (!abort.signal.aborted) setInfoError(true); }
    };
    void load(); const timer = setInterval(load, 10000);
    return () => { clearInterval(timer); abort.abort(); };
  }, []);
  const points = history.filter(point => point.timestamp >= Date.now() - (range === '15m' ? 900000 : 3600000));
  const good = !stale && healthSummary.status === 'healthy';
  const display = (value: number | string) => hasSample ? value : '—';
  const cards = [
    { title: 'Commands / second', value: display(sample.opsPerSec.toLocaleString()), note: 'Measured from command counter deltas', icon: Zap, key: 'opsPerSec' as const, term: 'pipelining', color: '#e77562' },
    { title: 'Memory in use', value: display(bytes(sample.usedMemory)), note: sample.maxMemory > 0 ? `${sample.memoryPercent}% of ${bytes(sample.maxMemory)} limit` : 'No memory limit configured', icon: HardDrive, key: 'usedMemory' as const, term: 'maxmemory', color: '#8d9fe8' },
    { title: 'Connected clients', value: display(sample.connectedClients.toLocaleString()), note: `${sample.blockedClients} blocked connections`, icon: Users, key: 'connectedClients' as const, term: 'pipelining', color: '#6fb7a7' },
    { title: 'Cache hit rate', value: display(`${sample.hitRate.toFixed(1)}%`), note: 'Hits as a share of key lookups', icon: Activity, key: 'hitRate' as const, term: 'hit rate', color: '#c9ab70' },
  ];
  const peak = points.length ? Math.max(...points.map(point => point.opsPerSec)) : null;
  const average = points.length ? Math.round(points.reduce((sum, point) => sum + point.opsPerSec, 0) / points.length) : null;
  const expiring = info ? Object.values(info.keyspace).reduce((sum, db) => sum + db.expires, 0) : null;
  return <div className="studio-dashboard">
    <div className="studio-page-heading"><div><div className="studio-eyebrow">WORKSPACE OVERVIEW</div><h1>Dashboard<span>.</span></h1><p>Your engine at a glance. Every reading, straight from the source.</p></div><Link to="/keys" className="studio-primary">Explore data <ArrowUpRight size={16} /></Link></div>
    <div className={`studio-health ${good ? 'is-healthy' : 'needs-attention'}`}>
      <div className="studio-health-icon">{good ? <CheckCircle2 size={21} /> : <AlertTriangle size={21} />}</div>
      <div><strong>{stale ? 'Waiting for a live connection' : engine?.isDemo ? 'You’re exploring the demo workspace' : good ? 'Your engine is running smoothly' : healthSummary.topIssue?.title ?? 'Review engine health'}</strong><p>{stale ? 'Readings will update when the gateway can reach your engine.' : engine?.isDemo ? 'These are sample readings from an in-memory dataset, separate from your C++ engine.' : good ? 'No alerts from the available engine readings. Keep an eye on changes below.' : healthSummary.topIssue?.description}</p></div>
      <span className="studio-health-tag">{stale ? 'AWAITING DATA' : engine?.isDemo ? 'DEMO' : good ? 'HEALTHY' : 'ATTENTION'}</span>
    </div>
    <div className="studio-kpi-grid">{cards.map(card => <section className="studio-kpi" key={card.key} aria-label={card.title}>
      <div className="studio-kpi-title"><span>{card.title}<InfoTip term={card.term} /></span><card.icon size={16} /></div>
      <div className="studio-kpi-value">{card.value}</div><div className="studio-kpi-note">{hasSample ? card.note : 'Waiting for first sample'}</div>
      <Sparkline data={points.map(point => ({ value: point[card.key] }))} color={card.color} gradientId={`dashboard-${card.key}`} height={44} />
    </section>)}</div>
    <div className="studio-dashboard-grid"><section className="studio-panel studio-throughput">
      <div className="studio-panel-heading"><div><h2><Activity size={16} /> Command activity</h2><p>Operations processed by the engine</p></div><div className="studio-segmented" aria-label="Chart time range">{(['15m', '1h'] as const).map(value => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value === '15m' ? '15 min' : '1 hour'}</button>)}</div></div>
      <div className="studio-chart-summary"><div><span>Current</span><strong>{display(sample.opsPerSec.toLocaleString())}<small>ops/s</small></strong></div><div><span>Average</span><strong>{average?.toLocaleString() ?? '—'}</strong></div><div><span>Peak</span><strong>{peak?.toLocaleString() ?? '—'}</strong></div></div>
      <div className="studio-activity-chart" role="img" aria-label={`Command activity across ${points.length} recorded samples`}>{points.length > 1 ? <Sparkline data={points.map(point => ({ value: point.opsPerSec }))} color="#df7668" gradientId="dashboard-activity" height={180} /> : <div className="studio-chart-empty"><Clock size={22} /><span>Collecting your first readings</span><small>The chart builds as real samples arrive.</small></div>}</div>
      <div className="studio-chart-axis"><span>{points[0] ? new Date(points[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span><span>{engine?.isDemo ? 'Sample dataset' : `${points.length} recorded samples`}</span><span>{points.length ? new Date(points[points.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}</span></div>
    </section><section className="studio-panel studio-server"><div className="studio-panel-heading"><h2><Server size={16} /> Server details</h2><span className="studio-tiny-label">INFO</span></div>
      {infoError && <p role="status" className="studio-form-error">Server details unavailable. Check the connection.</p>}
      <dl>{[
        ['Endpoint', engine ? `${engine.host}:${engine.port}` : '—'], ['Version', info?.server.redis_version ?? '—'],
        ['Role', info?.replication.role ?? '—'], ['Uptime', info ? uptime(info.server.uptime_in_seconds) : '—'],
        ['Process ID', info?.server.process_id ?? 'Not reported'], ['Eviction policy', info?.memory.maxmemory_policy ?? '—'],
        ['Data source', engine?.isDemo ? 'Demo dataset' : engine?.status === 'connected' ? 'Live RESP connection' : 'Unavailable'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="studio-server-footnote"><span className={`studio-status-dot ${!stale ? 'is-live' : ''}`} />{stale ? 'Connection needs attention' : 'Gateway connected'}</div>
    </section></div>
    <div className="studio-bottom-grid"><section className="studio-panel studio-keyspace"><div className="studio-panel-heading"><h2><Database size={16} /> Keyspace</h2><Link to="/keys" aria-label="Open key explorer"><ArrowUpRight size={17} /></Link></div><div className="studio-keyspace-value">{display(sample.totalKeys.toLocaleString())}<span>keys across all databases</span></div><div className="studio-keyspace-details"><span><i />{expiring?.toLocaleString() ?? '—'} with expiration</span><span>{display(sample.expiredKeysPerSec)} expired/s</span></div></section>
    <section className="studio-panel studio-attention"><div className="studio-panel-heading"><h2><CheckCircle2 size={16} /> Attention needed</h2><span className="studio-count">{healthSummary.thingsToLookAt.length}</span></div>{stale ? <p>Health checks resume when the engine is available.</p> : healthSummary.thingsToLookAt.length === 0 ? <p>No issues detected in the available readings.<br /><span>Latency percentiles are not reported by this engine.</span></p> : healthSummary.thingsToLookAt.map(issue => <Link key={issue.id} to={issue.deepLink} className="studio-issue"><AlertTriangle size={15} /><span>{issue.title}</span><ArrowRight size={15} /></Link>)}</section>
    <Link to="/console" className="studio-console-link"><Terminal size={22} /><h2>Go straight to the source.</h2><p>Run commands, inspect replies, and see exactly what your engine returns.</p><span>Open console <ArrowUpRight size={16} /></span></Link></div>
    <div className="studio-dashboard-footnote"><span>Collected via INFO · Updates every second</span><span>{hasSample ? `Last reading ${new Date(sample.timestamp).toLocaleTimeString()}` : 'No readings collected yet'}</span></div>
  </div>;
};
