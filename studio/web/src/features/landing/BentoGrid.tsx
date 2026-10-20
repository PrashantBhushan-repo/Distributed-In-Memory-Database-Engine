import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search, ArrowRight } from 'lucide-react';
import { areas } from '../../content/uses';
import { copy } from '../../content/features';
import { facts, demo } from '../../content/facts';
import { icons, Trace } from './Primitives';

const groups = [[0], [1, 2], [3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14], [15]];
export function BentoGrid() {
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [capabilities, setCapabilities] = useState<Set<string> | null>(null);
  useEffect(() => {
    const token = localStorage.getItem('redisx_token');
    if (!token) return;
    const controller = new AbortController();
    fetch('/api/capabilities', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (res) => { if (!res.ok) return; const data: unknown = await res.json(); if (typeof data === 'object' && data && 'capabilities' in data && Array.isArray(data.capabilities) && data.capabilities.every((v: unknown) => typeof v === 'string')) setCapabilities(new Set(data.capabilities as string[])); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const visible = groups.map((group) => group.map((i) => areas[i]).filter((area) => (filter === 'All' || area.group === filter) && `${area.title} ${area.description}`.toLowerCase().includes(query.toLowerCase()))).filter((group) => group.length);
  return <section className="lp-section lp-tools" id="tools"><div className="lp-section-heading"><div><p className="lp-eyebrow">{copy.bento.eyebrow}</p><h2>{copy.bento.title}<br /><em>{copy.bento.emphasis}</em></h2><p>{copy.bento.intro}</p></div><div className="lp-area-count"><strong title={facts.areas.source}>{facts.areas.value}</strong><span>{copy.bento.count}</span></div></div>
    <div className="lp-tool-controls"><div role="group" aria-label={copy.bento.all}>{copy.bento.filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><label><Search size={15} /><input type="search" placeholder={copy.bento.search} aria-label={copy.bento.searchLabel} value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
    <div className="lp-bento">{visible.map((group) => <article className={`lp-tool-card ${group[0].path === '/dashboard' || group[0].path === '/playground' ? 'lp-tool-featured' : ''}`} key={group[0].path}>
      {group.map((area) => { const Icon = icons[area.icon]; const unsupported = capabilities !== null && 'capability' in area && area.capability !== undefined && !capabilities.has(area.capability); const inner = <><span className="lp-tool-icon"><Icon size={19} /></span><div><h3>{area.title}</h3><p>{unsupported ? copy.bento.unsupported : area.description}</p></div><ArrowUpRight size={16} /></>; return unsupported ? <div className="lp-tool-link lp-tool-disabled" aria-disabled="true" title={copy.bento.unsupported} key={area.path}>{inner}</div> : <Link className="lp-tool-link" to={area.path} key={area.path}>{inner}</Link>; })}
      {group[0].path === '/dashboard' && <div className="lp-bento-chart"><span className="lp-mono">{copy.preview.sample}</span><Trace values={demo.chart} label={copy.preview.chartLabel} /></div>}
      {group[0].path === '/playground' && <div className="lp-mini-structures" aria-hidden="true"><i /><span>→</span><i /><span>→</span><i /></div>}
    </article>)}</div>
    {!visible.length && <div className="lp-tool-empty" role="status"><p>{copy.bento.empty}</p><button onClick={() => { setFilter('All'); setQuery(''); }}>{copy.bento.reset}<ArrowRight size={14} /></button></div>}
  </section>;
}
