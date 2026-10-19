import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, BookOpen, Check, ChevronDown, Copy, ExternalLink, Flame, LayoutDashboard, Terminal } from 'lucide-react';
import { monitoringLinks } from './monitoring';

const START_MONITORING = 'docker compose -p pbredisdb -f docker-compose.monitoring.yml up -d --wait';
const ACTIVITY = 'SET studio:monitoring:message "Hello from Studio" EX 120\nGET studio:monitoring:message\nSET studio:monitoring:counter 0 EX 120\nINCR studio:monitoring:counter\nINCR studio:monitoring:counter';
const CLEANUP = 'DEL studio:monitoring:message studio:monitoring:counter';
const QUERIES = [
  { id: 'connection', label: 'Is the engine connected?', query: 'up{job="redisx"}', result: '1 means Prometheus can reach the engine. 0 means the target is down.' },
  { id: 'throughput', label: 'How busy is the engine?', query: 'rate(redis_commands_processed_total{job="redisx"}[1m])', result: 'Commands per second over the last minute. Monitoring requests also contribute to this number.' },
  { id: 'memory', label: 'How much memory is in use?', query: 'redis_memory_used_bytes{job="redisx"}', result: 'Allocated engine memory in bytes. A few small keys may produce only a small change.' },
];

function Command({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setError(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setError(true); }
  };
  return <div className="monitoring-command-wrap">
    <div className="monitoring-command"><pre><code>{text}</code></pre><button type="button" onClick={() => void copy()} aria-label={`Copy ${label}`} title={copied ? 'Copied' : 'Copy to clipboard'}>{copied ? <Check size={15} /> : <Copy size={15} />}<span>{copied ? 'Copied' : 'Copy'}</span></button></div>
    <span role="status" className={error ? 'monitoring-copy-error' : 'sr-only'}>{error ? 'Copy is unavailable. Select the text and copy it manually.' : copied ? `${label} copied` : ''}</span>
  </div>;
}

export const MonitoringTools = React.memo(function MonitoringTools() {
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState(0);
  const links = monitoringLinks(window.location.origin, { prometheus: import.meta.env.VITE_PROMETHEUS_URL, grafana: import.meta.env.VITE_GRAFANA_URL });
  const external = { target: '_blank', rel: 'noopener noreferrer' };
  return <section className="monitoring-tools" id="monitoring-tools" aria-labelledby="monitoring-title">
    <header className="monitoring-heading"><div><span className="monitoring-eyebrow">MONITORING TOOLS</span><h2 id="monitoring-title">Go from a number to an answer.</h2><p>Inspect individual measurements in Prometheus. Follow the bigger picture in Grafana.</p></div>
      <button type="button" className="studio-secondary monitoring-guide-toggle" aria-expanded={expanded} aria-controls="monitoring-guide" onClick={() => setExpanded(value => !value)}><BookOpen size={15} />{expanded ? 'Close quick start' : 'New here? Quick start'}<ChevronDown size={14} className={expanded ? 'is-expanded' : ''} /></button>
    </header>
    <div className="monitoring-services">
      <article className="monitoring-service"><span className="monitoring-service-icon is-prometheus"><Flame size={23} /></span><div className="monitoring-service-copy"><h3>Prometheus <span>Metrics & queries</span></h3><p>Check collection health and ask questions about your engine.</p><small>{links.prometheusHost}</small></div><a href={links.prometheus} {...external} className="studio-secondary" aria-label="Open Prometheus in a new tab">Open Prometheus<ExternalLink size={14} /></a></article>
      <article className="monitoring-service"><span className="monitoring-service-icon is-grafana"><LayoutDashboard size={22} /></span><div className="monitoring-service-copy"><h3>Grafana <span>Visual dashboards</span></h3><p>Explore memory, traffic, and activity together over time.</p><small>{links.grafanaHost}</small></div><a href={links.grafana} {...external} className="studio-secondary" aria-label="Open Grafana in a new tab">Open Grafana<ExternalLink size={14} /></a></article>
    </div>
    <div className="monitoring-flow"><Activity size={13} /><span>C++ engine</span><ArrowRight size={12} /><span>Prometheus collects</span><ArrowRight size={12} /><span>Grafana visualizes</span><small>Tools open in a new tab.</small></div>
    {expanded && <div id="monitoring-guide" className="monitoring-guide">
      <nav className="monitoring-steps" aria-label="Monitoring quick start steps">{['Check the connection', 'Create some activity', 'Explore the graphs'].map((title, index) => <button type="button" key={title} aria-pressed={step === index} onClick={() => setStep(index)}><span>{index + 1}</span>{title}</button>)}</nav>
      <div className="monitoring-step-content">
        {step === 0 && <div>
          <h3>Start with a healthy connection.</h3><p>Open <a href={links.targets} {...external}>Prometheus targets <ExternalLink size={12} /></a> and find the <code>redisx</code> job. Its state should be <strong>UP</strong>.</p>
          <p>Next, open Prometheus, paste this query into its expression field, and run it in Table view.</p>
          <Command text={QUERIES[0].query} label="connection query" /><p className="monitoring-expected"><Check size={14} />Expected result: <strong>1</strong>. Collection runs every 5 seconds in the local setup.</p>
          <button type="button" className="studio-secondary" onClick={() => setStep(1)}>Next: create activity<ArrowRight size={14} /></button>
        </div>}
        {step === 1 && <div>
          <h3>Make a small, visible change.</h3><p>Open the <a href="/console" {...external}>Studio Console <ExternalLink size={12} /></a>. Copy these commands and run <strong>one line at a time</strong>. They create two test keys that expire after 2 minutes.</p>
          <Command text={ACTIVITY} label="sample engine commands" />
          <p className="monitoring-expected"><Terminal size={14} />SET returns OK, GET returns Hello from Studio, and INCR returns 1 then 2.</p>
          <p>Repeat GET or INCR a few times to create more activity. To remove the test keys immediately, run:</p><Command text={CLEANUP} label="test key cleanup command" />
          <button type="button" className="studio-secondary" onClick={() => setStep(2)}>Next: explore graphs<ArrowRight size={14} /></button>
        </div>}
        {step === 2 && <div>
          <h3>See what changed, and why.</h3><p>Open Grafana, choose <strong>Last 15 minutes</strong>, and keep the refresh interval at <strong>5 seconds</strong>. The button above opens that view for you.</p>
          <p>In Prometheus, copy a query below and run it. Use Table for the current value or Graph to see changes over time.</p>
          <div className="monitoring-query-list">{QUERIES.map(query => <article key={query.id}><h4>{query.label}</h4><Command text={query.query} label={`${query.id} query`} /><p>{query.result}</p></article>)}</div>
          <p className="monitoring-expected"><Activity size={14} />Allow 30–60 seconds for a rate graph to gather samples. A flat line can simply mean the engine is quiet.</p>
        </div>}
      </div>
      <details className="monitoring-troubleshooting"><summary>A tool will not open, or the graphs show no data?</summary><div><p>Keep Docker Desktop and your C++ engine running. For the local native/WSL setup, run this from your project folder to start monitoring:</p><Command text={START_MONITORING} label="monitoring startup command" /><p>If the target is DOWN, check that the engine metrics endpoint on port 9121 is running. If Grafana requests a login, use the account configured for your Grafana installation.</p><p>Prometheus follows its configured scrape target. Changing the engine connection in Studio does not change that target automatically. Studio’s live charts use gateway history; Grafana uses the history collected by Prometheus.</p></div></details>
    </div>}
  </section>;
});
