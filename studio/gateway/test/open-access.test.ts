import { afterAll, describe, expect, it, vi } from 'vitest';

vi.stubEnv('STUDIO_AUTH_MODE', 'open');
const { app } = await import('../src/server.js');
afterAll(async () => { await app.close(); vi.unstubAllEnvs(); });

describe('Explicit account-free Studio', () => {
  it('announces open access to the frontend', async () => {
    const response = await app.inject({ url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().accessMode).toBe('open');
  });
  it.each(['/api/info', '/api/keys', '/api/config', '/api/audit'])('serves %s without credentials', async url => {
    expect((await app.inject({ url })).statusCode).toBe(200);
  });
});
