import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Search, Terminal, Database, X } from 'lucide-react';
import { demo } from '../../content/facts';
import { copy } from '../../content/features';
import { areas } from '../../content/uses';
import { parseCommandLine } from '../console/commandUtils';
import { Mark, Trace, icons } from './Primitives';

const t = copy.preview;
export default function StudioPreview({ paused }: { paused: boolean }) {
  const [selected, setSelected] = useState(demo.keys[0]);
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<Array<{ command: string; reply: string }>>([...t.initial]);
  const [values, setValues] = useState<Record<string, string>>({ 'user:1': 'Prashant' });
  const output = useRef<HTMLDivElement>(null);
  useEffect(() => { if (output.current) output.current.scrollTop = output.current.scrollHeight; }, [entries]);
  function run(event: React.FormEvent) {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;
    const [name = '', ...args] = parseCommandLine(command);
    const key = args[0];
    const owns = key !== undefined && Object.prototype.hasOwnProperty.call(values, key);
    let reply: string = t.unsupported;
    switch (name.toUpperCase()) {
      case 'PING': reply = args.length <= 1 ? (args[0] ?? t.pong) : t.wrongArgs; break;
      case 'HELP': reply = t.help; break;
      case 'SET':
        if (args.length !== 2) { reply = t.wrongArgs; break; }
        setValues((prev) => ({ ...prev, [key]: args[1] })); reply = t.ok;
        if (selected.name === key) setSelected({ ...selected, value: args[1] });
        break;
      case 'GET': reply = args.length !== 1 ? t.wrongArgs : owns ? JSON.stringify(values[key]) : t.nil; break;
      case 'EXISTS': reply = args.length !== 1 ? t.wrongArgs : owns ? '1' : '0'; break;
      case 'TYPE': reply = args.length !== 1 ? t.wrongArgs : owns ? 'string' : 'none'; break;
      case 'DBSIZE': reply = args.length ? t.wrongArgs : String(Object.keys(values).length); break;
      case 'DEL':
        if (args.length !== 1) { reply = t.wrongArgs; break; }
        setValues((prev) => { const next = { ...prev }; delete next[key]; return next; });
        if (selected.name === key) setSelected({ ...selected, value: t.nil });
        reply = owns ? '1' : '0'; break;
    }
    setEntries((prev) => [...prev.slice(-39), { command, reply }]);
    setInput('');
  }
  return <figure className="lp-preview-figure" id="studio-preview" aria-describedby="preview-caption">
    <div className="lp-window">
      <div className="lp-windowbar"><span className="lp-traffic" aria-hidden="true"><i /><i /><i /></span><span><Mark small /> {copy.studio}</span><span className="lp-sample" title={demo.source}>{t.sample}</span></div>
      <div className="lp-studio">
        <aside className="lp-preview-sidebar" aria-label={copy.studio}>
          <div className="lp-preview-brand"><Mark small /><span>{copy.studio}</span></div>
          <span className="lp-sidebar-eyebrow">{t.connection}</span>
          {areas.slice(0, 12).map((area) => { const Icon = icons[area.icon]; return <Link key={area.path} to={area.path} className={area.path === '/dashboard' ? 'is-active' : ''}><Icon size={14} /><span>{area.title}</span></Link>; })}
          <Link className="lp-sidebar-learn" to="/learn"><BookIcon />{copy.nav[2].label}<ArrowUpRight size={13} /></Link>
        </aside>
        <div className="lp-preview-main">
          <div className="lp-preview-topline"><span><i className="lp-status-dot" />{t.badge}</span><Link className="lp-primary lp-open-studio" to="/dashboard">{copy.studioLink}<ArrowUpRight size={18} /></Link></div>
          <div className="lp-preview-heading"><div><h2>{t.title}</h2><p>{t.subtitle}</p></div><span className="lp-mono">{t.sample}</span></div>
          <div className="lp-stat-grid">{demo.stats.map((stat) => <div key={stat.label}><span>{stat.label}</span><strong>{stat.value}<small>{'unit' in stat ? stat.unit : ''}</small></strong><p>{stat.detail}</p></div>)}</div>
          <div className="lp-preview-middle"><section className="lp-activity"><div className="lp-panel-label"><span><ActivityIcon />{t.activity}</span><span className="lp-mono">{t.sample}</span></div><Trace values={demo.chart} label={t.chartLabel} animated paused={paused} /></section><section className="lp-key-detail"><div className="lp-panel-label"><span><Database size={13} />{t.selected}</span></div><code>{selected.name}</code><p>{selected.value}</p><span className="lp-type">{selected.type}</span></section></div>
          <div className="lp-preview-bottom"><section className="lp-key-list"><div className="lp-panel-label"><span><Search size={13} />{areas[1].title}</span><Link to="/keys" aria-label={t.inspect}><ArrowUpRight size={13} /></Link></div><div className="lp-key-table-head"><span>{t.key}</span><span>{t.type}</span></div>{demo.keys.map((key) => <button key={key.name} aria-pressed={selected.name === key.name} onClick={() => setSelected({ ...key, value: key.name === 'user:1' ? values['user:1'] ?? t.nil : key.value })}><span><Database size={12} />{key.name}</span><span className="lp-type">{key.type}</span></button>)}</section>
            <section className="lp-terminal"><div className="lp-panel-label"><span><Terminal size={13} />{t.console}</span><button onClick={() => setEntries([])} aria-label={t.clear}><X size={13} /></button></div><div className="lp-terminal-output" ref={output} role="log" aria-live="polite">{entries.length ? entries.map((entry, i) => <div key={`${i}-${entry.command}`}><p><span>❯</span> {entry.command}</p><code>{entry.reply}</code></div>) : <p>{t.empty}</p>}</div><form onSubmit={run}><span aria-hidden="true">❯</span><input aria-label={t.input} placeholder={t.placeholder} value={input} maxLength={512} onChange={(e) => setInput(e.target.value)} autoComplete="off" spellCheck={false} /><button aria-label={t.run} type="submit"><ArrowRight size={15} /></button></form></section>
          </div>
          <p className="lp-preview-hint">{t.hint}</p>
        </div>
      </div>
    </div>
    <figcaption id="preview-caption">{t.caption}</figcaption>
  </figure>;
}
function BookIcon() { const Icon = icons.book; return <Icon size={14} />; }
function ActivityIcon() { const Icon = icons.activity; return <Icon size={13} />; }
