import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Github, Menu, Moon, Pause, Play, Sun, X } from 'lucide-react';
import { copy } from '../../content/features';
import { compatibility, facts, repository } from '../../content/facts';
import { Mark } from './Primitives';
import { FeatureSections } from './FeatureSections';
import { BentoGrid } from './BentoGrid';
import { Architecture, Comparison, Evidence, FAQ, FinalCTA, RunOptions, UseCases } from './Sections';
import './landing.css';

const StudioPreview = lazy(() => import('./StudioPreview'));
const CommandPalette = lazy(() => import('../../components/CommandPalette').then((module) => ({ default: module.CommandPalette })));
function DeferredPreview({ paused }: { paused: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = document.getElementById('preview-mount');
    if (!node || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '400px' });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  return <div id="preview-mount" className="lp-preview-mount">{visible ? <Suspense fallback={<StaticPreview />}><StudioPreview paused={paused} /></Suspense> : <StaticPreview />}</div>;
}
function StaticPreview() {
  return <figure className="lp-preview-figure" id="studio-preview"><div className="lp-static-preview"><div className="lp-mini-bar"><span><Mark small />{copy.studio}</span><span className="lp-sample">{copy.preview.sample}</span></div><div className="lp-static-body"><div><p className="lp-eyebrow">{copy.preview.connection}</p><h2>{copy.preview.title}</h2><p>{copy.preview.subtitle}</p><div className="lp-static-metrics">{copy.strip.items.map((item) => <span key={item}>{item}</span>)}</div></div><pre><code>{copy.preview.initial.map((line) => `› ${line.command}\n${line.reply}`).join('\n\n')}</code></pre></div></div><figcaption>{copy.preview.caption}</figcaption></figure>;
}
export function LandingPage({ compare = false }: { compare?: boolean }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [returning, setReturning] = useState(false);
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    setTheme(localStorage.getItem('redisx_theme') === 'light' ? 'light' : 'dark');
    setPaused(localStorage.getItem('pbredis_motion') === 'paused');
    setReturning(Boolean(localStorage.getItem('redisx_token')));
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const listener = () => setReduced(media.matches);
    media.addEventListener('change', listener);
    const keyboard = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((prev) => !prev); } if (e.key === 'Escape') { setMenu(false); setPalette(false); } };
    window.addEventListener('keydown', keyboard);
    return () => { media.removeEventListener('change', listener); window.removeEventListener('keydown', keyboard); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const stopped = paused || reduced;
  const showIntro = !returning || intro;
  const verified = compatibility.filter((item) => item.verified);
  return <div className="lp" data-theme={theme} data-paused={stopped}>
    <a className="lp-skip" href="#main-content">{copy.skip}</a>
    <header className="lp-header"><nav className="lp-nav lp-container" aria-label={copy.brand}><Link to="/" className="lp-brand"><Mark />{copy.brand}<span className="lp-brand-dot">.</span></Link><div className={`lp-nav-links ${menu ? 'is-open' : ''}`}>{copy.nav.map((item) => <a key={item.label} href={compare ? `/${item.href}` : item.href} onClick={() => setMenu(false)}>{item.label}</a>)}</div><div className="lp-nav-actions"><a className="lp-github-link" href={repository} target="_blank" rel="noreferrer" aria-label={copy.github}><Github size={17} /><span>{copy.github}</span></a><span className="lp-nav-divider" /><button className="lp-icon-button" onClick={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem('redisx_theme', next); }} aria-label={copy.theme}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button><button className="lp-motion" aria-pressed={stopped} onClick={() => { setPaused(!paused); localStorage.setItem('pbredis_motion', !paused ? 'paused' : 'playing'); }} title={stopped ? copy.resume : copy.pause}>{stopped ? <Play size={13} /> : <Pause size={13} />}<span>{stopped ? copy.resume : copy.pause}</span></button><a className="lp-primary lp-nav-cta" href={compare ? '/#studio-preview' : '#studio-preview'}>{copy.demo}<ArrowUpRight size={14} /></a><button className="lp-mobile-menu lp-icon-button" onClick={() => setMenu(!menu)} aria-label={copy.menu} aria-expanded={menu}>{menu ? <X size={20} /> : <Menu size={20} />}</button></div></nav></header>
    <main id="main-content" className="lp-container">
      {compare ? <><h1 className="lp-comparison-h1">{copy.compare.title}</h1><Comparison full /></> : <>
        {returning && <section className="lp-welcome"><div><h1>{copy.welcome.title}</h1><p>{copy.welcome.subtitle}</p></div><Link className="lp-primary" to="/dashboard">{copy.welcome.continue}<ArrowRight size={15} /></Link><button className="lp-text-link" onClick={() => setIntro(!intro)}>{intro ? copy.welcome.hide : copy.welcome.show}</button></section>}
        {returning && <BentoGrid />}
        {showIntro && <>
          <section className="lp-hero"><div className="lp-hero-badge"><span className="lp-status-dot" />{copy.eyebrow}<ArrowUpRight size={12} /></div>{returning ? <h2 className="lp-hero-title">{copy.headline}<br /><em>{copy.emphasis}</em></h2> : <h1 className="lp-hero-title">{copy.headline}<br /><em>{copy.emphasis}</em></h1>}<p className="lp-hero-intro">{copy.intro}</p><div className="lp-hero-actions"><a href="#studio-preview" className="lp-primary">{copy.demo}<ArrowRight size={17} /></a><a href={repository} target="_blank" rel="noreferrer" className="lp-secondary"><Github size={17} />{copy.viewSource}</a></div><p className="lp-hero-micro">{copy.micro}</p><DeferredPreview paused={stopped} /></section>
          <section className="lp-strip" aria-label={copy.strip.label}><span>{copy.strip.label}</span><div>{copy.strip.items.map((item) => <span key={item}>{item}</span>)}<code title={facts.language.source}>{facts.language.value}</code></div>{verified.length > 0 && <div>{verified.map((item) => <span key={item.name}>{item.name}</span>)}</div>}</section>
          <FeatureSections />{!returning && <BentoGrid />}<UseCases /><Architecture paused={stopped} /><Evidence /><Comparison /><RunOptions /><FAQ /><FinalCTA />
        </>}
      </>}
    </main>
    <footer className="lp-footer"><div className="lp-container lp-footer-top"><div><Link className="lp-brand" to="/"><Mark />{copy.brand}<span className="lp-brand-dot">.</span></Link><p>{copy.footer.description}</p><code title={facts.version.source}>{facts.version.value}</code></div><div><h2>{copy.footer.product}</h2><a href="/#features">{copy.nav[0].label}</a><Link to="/dashboard">{copy.studio}</Link><Link to="/learn/labs">{copy.nav[2].label}</Link><Link to="/compare/redis">{copy.footer.scope}</Link></div><div><h2>{copy.footer.project}</h2><a href={repository}>{copy.footer.source}</a><a href={`${repository}/issues`}>{copy.footer.issues}</a><a href={`${repository}/commits/main`}>{copy.footer.history}</a></div></div><div className="lp-container lp-footer-bottom"><span>© {new Date().getFullYear()} {copy.footer.copyright}</span><span>{copy.footer.credit}</span><a href={repository} aria-label={copy.github}><Github size={16} /></a></div></footer>
    {palette && <Suspense fallback={null}><CommandPalette isOpen={palette} onClose={() => setPalette(false)} /></Suspense>}
  </div>;
}
export default LandingPage;
