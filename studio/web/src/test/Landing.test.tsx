import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../features/landing/LandingPage';
import { BentoGrid } from '../features/landing/BentoGrid';
import StudioPreview from '../features/landing/StudioPreview';
import { facts } from '../content/facts';
import { areas } from '../content/uses';
function mount(node: React.ReactNode) { return render(<MemoryRouter>{node}</MemoryRouter>); }
beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline'))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Landing credibility and navigation', () => {
  it('keeps a source on every published or unmeasured fact', () => { for (const fact of Object.values(facts)) expect(fact.source.trim().length).toBeGreaterThan(10); });
  it('links all sixteen product areas to existing app routes', () => { mount(<BentoGrid />); expect(areas).toHaveLength(16); for (const area of areas) expect(screen.getByRole('link', { name: new RegExp(area.title.replace('&', '\\&')) })).toHaveAttribute('href', area.path); });
  it('filters by audience and searches immediately', () => { mount(<BentoGrid />); fireEvent.click(screen.getByRole('button', { name: 'Engineer', exact: true })); expect(screen.queryByRole('link', { name: /^Key Explorer/ })).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: /^Memory & Eviction/ })).toBeInTheDocument(); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nonsense' } }); expect(screen.getByRole('status')).toHaveTextContent('No tools match'); fireEvent.click(screen.getByRole('button', { name: /Clear search/ })); expect(screen.getByRole('link', { name: /^Key Explorer/ })).toBeInTheDocument(); });
  it('disables unsupported server areas after an authenticated capability response', async () => { localStorage.setItem('redisx_token', 'test-token'); vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ capabilities: ['INFO'] }))); mount(<BentoGrid />); await waitFor(() => expect(screen.queryByRole('link', { name: /^Key Explorer/ })).not.toBeInTheDocument()); expect(screen.getAllByText('Not supported by this server').length).toBeGreaterThan(0); });
  it('does not request authenticated capabilities for anonymous visitors', () => { mount(<BentoGrid />); expect(fetch).not.toHaveBeenCalled(); });
});
describe('Public experience', () => {
  it('has a single h1 and no app onboarding overlay', async () => { mount(<LandingPage />); await screen.findByRole('textbox', { name: 'Redis demo command' }); expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1); expect(screen.queryByText('1. Categorized Navigation Sidebar')).not.toBeInTheDocument(); });
  it('persists light theme and animation pause', () => { const { container } = mount(<LandingPage />); fireEvent.click(screen.getByRole('button', { name: 'Toggle color theme' })); expect(container.querySelector('.lp')).toHaveAttribute('data-theme', 'light'); fireEvent.click(screen.getByRole('button', { name: 'Pause animations' })); expect(container.querySelector('.lp')).toHaveAttribute('data-paused', 'true'); expect(localStorage.getItem('pbredis_motion')).toBe('paused'); });
  it('offers returning users the tool hub before the introduction', async () => { localStorage.setItem('redisx_token', 'saved-token'); mount(<LandingPage />); await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back')); expect(screen.queryByText('BUILT FROM SCRATCH. OPEN TO EXPLORE.')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Show intro' })); expect(screen.getByText('BUILT FROM SCRATCH. OPEN TO EXPLORE.')).toBeInTheDocument(); expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1); });
});
describe('Isolated command preview', () => {
  function command(value: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Redis demo command' }), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Run command' })); }
  it('executes SET / GET / DEL and never sends preview commands to a server', () => { mount(<StudioPreview paused />); command('SET example "hello world"'); command('GET example'); expect(screen.getByRole('log')).toHaveTextContent('"hello world"'); command('DEL example'); command('GET example'); expect(screen.getByRole('log')).toHaveTextContent('(nil)'); expect(fetch).not.toHaveBeenCalled(); });
  it('treats prototype-like key names as data', () => { mount(<StudioPreview paused />); command('GET constructor'); expect(screen.getByRole('log')).toHaveTextContent('(nil)'); command('SET __proto__ safe'); command('GET __proto__'); expect(screen.getByRole('log')).toHaveTextContent('"safe"'); });
  it('blocks destructive and unsupported commands without affecting data', () => { mount(<StudioPreview paused />); command('FLUSHALL'); expect(screen.getByRole('log')).toHaveTextContent('supports string commands only'); command('GET user:1'); expect(screen.getByRole('log')).toHaveTextContent('"Prashant"'); });
});
