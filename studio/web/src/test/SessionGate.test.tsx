import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionGate } from '../components/SessionGate';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Workspace access discovery', () => {
  it('opens the production workspace without a login form or stale credentials in open mode', async () => {
    localStorage.setItem('redisx_token', 'expired-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessMode: 'open' }) }));
    render(<SessionGate>Workspace contents</SessionGate>);
    expect(await screen.findByText('Workspace contents')).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(localStorage.getItem('redisx_token')).toBeNull();
    expect(JSON.parse(localStorage.getItem('redisx_user') ?? '{}').accessMode).toBe('open');
  });
  it('retries a failed health request without showing sign-in or granting access', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Gateway restarting'))
      .mockResolvedValue({ ok: true, json: async () => ({ accessMode: 'playground' }) });
    vi.stubGlobal('fetch', fetch);
    await act(async () => { render(<SessionGate>Workspace contents</SessionGate>); });
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByText('Workspace contents')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Reconnecting automatically');
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByText('Workspace contents')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('requires sign-in when the gateway explicitly requires authentication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessMode: 'authenticated' }) }));
    render(<SessionGate>Workspace contents</SessionGate>);
    expect(await screen.findByLabelText('Username')).toBeTruthy();
    expect(screen.queryByText('Workspace contents')).toBeNull();
  });
});
