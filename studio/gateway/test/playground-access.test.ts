import { describe, expect, it } from 'vitest';
import { isLocalPlayground, studioAccessMode } from '../src/auth/playground.js';

describe('Local account-free playground', () => {
  const local = { STUDIO_PLAYGROUND: true, NODE_ENV: 'development', HOST: '127.0.0.1' };
  it('opens an explicitly enabled loopback development workspace', () => {
    expect(isLocalPlayground(local, '127.0.0.1')).toBe(true);
    expect(isLocalPlayground(local, '::ffff:127.0.0.1')).toBe(true);
  });
  it('keeps authentication for production, remote peers, public listeners, and disabled mode', () => {
    expect(isLocalPlayground({ ...local, NODE_ENV: 'production' }, '127.0.0.1')).toBe(false);
    expect(isLocalPlayground({ ...local, HOST: '0.0.0.0' }, '127.0.0.1')).toBe(false);
    expect(isLocalPlayground({ ...local, STUDIO_PLAYGROUND: false }, '127.0.0.1')).toBe(false);
    expect(isLocalPlayground(local, '192.168.1.2')).toBe(false);
  });
  it('opens production only when open access is explicitly configured', () => {
    const production = { ...local, NODE_ENV: 'production', HOST: '0.0.0.0', STUDIO_PLAYGROUND: false };
    expect(studioAccessMode({ ...production, STUDIO_AUTH_MODE: 'open' }, '203.0.113.10')).toBe('open');
    expect(studioAccessMode({ ...production, STUDIO_AUTH_MODE: 'authenticated' }, '203.0.113.10')).toBe('authenticated');
    expect(studioAccessMode(production, '203.0.113.10')).toBe('authenticated');
  });
});
