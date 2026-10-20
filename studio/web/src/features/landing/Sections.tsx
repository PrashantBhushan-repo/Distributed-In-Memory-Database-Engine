import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Check, Copy, Database, GitBranch, Save, FileText } from 'lucide-react';
import { copy } from '../../content/features';
import { faq } from '../../content/faq';
import { repository, evidence } from '../../content/facts';
import benchmarks from '../../content/benchmarks.json';
import { uses, runs, stages } from '../../content/uses';
import { Mark } from './Primitives';

export function UseCases() {
  const track = useRef<HTMLDivElement>(null);
  return <section className="lp-section lp-use-section"><div className="lp-section-heading"><div><p className="lp-eyebrow">{copy.uses.eyebrow}</p><h2>{copy.uses.title}</h2></div><div className="lp-carousel-controls"><button aria-label={copy.uses.previous} onClick={() => track.current?.scrollBy({ left: -360, behavior: 'auto' })}><ChevronLeft size={19} /></button><button aria-label={copy.uses.next} onClick={() => track.current?.scrollBy({ left: 360, behavior: 'auto' })}><ChevronRight size={19} /></button></div></div><div className="lp-use-track" ref={track}>{uses.map((use) => <Link className="lp-use-card" to={use.path} key={use.title}><span className="lp-eyebrow">{use.tag}</span><h3>{use.title}<ArrowUpRight size={19} /></h3><p>{use.text}</p><code>{use.path}</code></Link>)}</div></section>;
}
export function Architecture({ paused }: { paused: boolean }) {
  const [selected, setSelected] = useState(0);
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    if (paused || !following) { setFollowing(false); return; }
    const timer = window.setInterval(() => setSelected((prev) => { if (prev === stages.length - 1) { setFollowing(false); return prev; } return prev + 1; }), 700);
    return () => window.clearInterval(timer);
  }, [paused, following]);
  return <section className="lp-section lp-inside" id="inside"><div className="lp-centered-heading"><p className="lp-eyebrow">{copy.architecture.eyebrow}</p><h2>{copy.architecture.title}</h2><p>{copy.architecture.intro}</p><button className="lp-secondary" onClick={() => { setSelected(0); setFollowing(!paused); }}>{copy.architecture.follow}<ArrowRight size={15} /></button></div><figure className="lp-pipeline-figure"><div className="lp-pipeline" role="group" aria-label={copy.architecture.caption}>{stages.map((stage, i) => <React.Fragment key={stage.title}><button className={selected === i ? 'is-active' : ''} aria-pressed={selected === i} onFocus={() => { setFollowing(false); setSelected(i); }} onMouseEnter={() => { if (!following) setSelected(i); }} onClick={() => { setFollowing(false); setSelected(i); }}><span aria-hidden="true">{i === 0 ? '›_' : i === stages.length - 1 ? <GitBranch size={20} /> : i === stages.length - 2 ? <Database size={20} /> : '·'}</span>{stage.title}</button>{i < stages.length - 1 && <ArrowRight className="lp-pipeline-arrow" size={15} aria-hidden="true" />}</React.Fragment>)}</div><figcaption><strong>{stages[selected].title}</strong><span>{stages[selected].text}</span></figcaption></figure><Link className="lp-text-link" to="/learn/tour">{copy.architecture.tour}<ArrowUpRight size={15} /></Link></section>;
}
export function Evidence() {
  return <section className="lp-section" id="evidence"><div className="lp-section-heading"><div><p className="lp-eyebrow">{copy.evidence.eyebrow}</p><h2>{copy.evidence.title}</h2><p>{copy.evidence.intro}</p></div></div><div className="lp-evidence-grid">{evidence.map((item) => <a href={repository + item.path} target="_blank" rel="noreferrer" className="lp-evidence-card" key={item.title}><div><strong title={item.fact.value === null ? copy.evidence.unmeasured : item.fact.source}>{item.fact.value ?? '—'}</strong><span className="lp-mini-badge">{copy.evidence.planned}</span></div><h3>{item.title}</h3><p>{item.description}</p><span className="lp-text-link">{copy.evidence.proof}<ArrowUpRight size={14} /></span></a>)}</div>{!benchmarks.measured && <p className="lp-evidence-note">{copy.evidence.sample}</p>}</section>;
}
export function Comparison({ full = false }: { full?: boolean }) {
  return <section className="lp-section lp-compare" id="compare"><div><p className="lp-eyebrow">{copy.compare.eyebrow}</p><h2>{copy.compare.title}</h2><p>{copy.compare.intro}</p><Link className="lp-text-link" to={full ? '/' : '/compare/redis'}>{full ? copy.brand : copy.compare.link}<ArrowRight size={15} /></Link></div><div className="lp-table-wrap"><table><thead><tr>{copy.compare.columns.map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{copy.compare.rows.map((row) => <tr key={row[0]}>{row.map((value, i) => i === 0 ? <th key={i} scope="row">{value}</th> : <td key={i}>{value}</td>)}</tr>)}</tbody></table></div></section>;
}
function CopyCommand({ command }: { command: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => { if (status === 'idle') return; const timer = window.setTimeout(() => setStatus('idle'), 2500); return () => window.clearTimeout(timer); }, [status]);
  return <div className="lp-copy-command"><pre><code>{command}</code></pre><button aria-label={status === 'copied' ? copy.run.copied : copy.run.copy} onClick={async () => { try { await navigator.clipboard.writeText(command); setStatus('copied'); } catch { setStatus('failed'); } }}>{status === 'copied' ? <Check size={15} /> : <Copy size={15} />}</button><span role="status" className={status === 'failed' ? 'lp-copy-error' : 'lp-sr-only'}>{status === 'copied' ? copy.run.copied : status === 'failed' ? copy.run.failed : ''}</span></div>;
}
export function RunOptions() {
  return <section className="lp-section" id="run"><div className="lp-centered-heading"><p className="lp-eyebrow">{copy.run.eyebrow}</p><h2>{copy.run.title}</h2><p>{copy.run.intro}</p></div><div className="lp-run-grid">{runs.map((run, i) => <article className={i === 0 ? 'lp-run-card is-featured' : 'lp-run-card'} key={run.title}><p className="lp-eyebrow">{run.tag}</p><h3>{run.title}</h3><p>{run.text}</p><CopyCommand command={run.command} /><p className="lp-run-requirements">{run.requirements}</p><p>{run.first}</p><a className={i === 0 ? 'lp-primary' : 'lp-secondary'} href={i === 0 ? run.href : `${repository}#readme`}>{run.action}<ArrowUpRight size={15} /></a></article>)}</div><p className="lp-local-note">{copy.run.local}</p></section>;
}
export function FAQ() {
  return <section className="lp-section lp-faq" id="faq"><div><p className="lp-eyebrow">{copy.faq.eyebrow}</p><h2>{copy.faq.title}</h2><p>{copy.faq.help}</p><a className="lp-text-link" href={`${repository}/issues`} target="_blank" rel="noreferrer">{copy.faq.issues}<ArrowUpRight size={15} /></a></div><div>{faq.map((item, i) => <details key={item.question}><summary><span>{String(i + 1).padStart(2, '0')}</span><h3>{item.question}</h3><span className="lp-faq-plus" aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></section>;
}
export function FinalCTA() {
  return <section className="lp-section lp-final"><p className="lp-eyebrow">{copy.final.eyebrow}</p><h2>{copy.final.title}<br /><em>{copy.final.emphasis}</em></h2><figure><div className="lp-fanout"><span className="lp-fan-client">{copy.final.nodes[0]}</span><span className="lp-fan-line" /><span className="lp-fan-engine"><Mark />{copy.brand}</span><span className="lp-fan-line" /><div className="lp-fan-ends">{[Save, FileText, GitBranch].map((Icon, i) => <span key={i}><Icon size={16} />{copy.final.nodes[i + 1]}</span>)}</div></div><figcaption className="lp-sr-only">{copy.final.caption}</figcaption></figure><a href="#studio-preview" className="lp-primary">{copy.demo}<ArrowRight size={16} /></a><p className="lp-final-note">{copy.micro}</p></section>;
}
