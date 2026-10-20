import { describe, it, expect, afterAll } from 'vitest';
import { environmentBoolean } from '../src/config/boolean.js';
import { parseRedisInfo } from '../src/redis/info.js';
import { sandboxTokens } from '../src/playground/live.js';
import { app } from '../src/server.js';
import { createToken } from '../src/auth/jwt.js';

afterAll(() => app.close());
describe('Data accuracy and access boundaries', () => {
  it('parses literal environment flags without turning false into true', () => {
    for (const value of ['false', '0', '']) expect(environmentBoolean.parse(value)).toBe(false);
    for (const value of ['true', '1']) expect(environmentBoolean.parse(value)).toBe(true);
    expect(environmentBoolean.safeParse('sometimes').success).toBe(false);
  });
  it('retains engine counters, zero memory limit, and real process identity', () => {
    const info = parseRedisInfo('# Server\r\nprocess_id:42\r\nredis_mode:standalone\r\n# Memory\r\nmaxmemory:0\r\n# Stats\r\nexpired_keys:0\r\nevicted_keys:17\r\ntotal_net_input_bytes:0\r\nrejected_connections:3\r\n');
    expect(info.server.process_id).toBe(42);
    expect(info.memory.maxmemory).toBe(0);
    expect(info.stats.expired_keys).toBe(0);
    expect(info.stats.evicted_keys).toBe(17);
    expect(info.stats.total_net_input_bytes).toBe(0);
    expect(info.stats.total_net_output_bytes).toBeUndefined();
  });
  it.each(['EVAL "return 1" 0', 'FLUSHDB', 'RENAME play:x outside', 'MSET play:x 1 outside 2', 'GET outside', 'SELECT 0'])('rejects sandbox escape: %s', command => {
    expect(() => sandboxTokens(command)).toThrow();
  });
  it('accepts quoted sandbox values and checks every multi-key argument', () => {
    expect(sandboxTokens('SET play:hello "hello world"').tokens).toEqual(['SET', 'play:hello', 'hello world']);
    expect(sandboxTokens('MGET play:a play:b').keys).toEqual(['play:a', 'play:b']);
  });
  it('rejects missing and invalid credentials on API routes and WebSocket upgrades', async () => {
    for (const url of ['/api/info', '/api/keys', '/api/config', '/api/audit', '/ws/metrics?token=invalid', '/ws/pubsub']) {
      expect((await app.inject({ url })).statusCode).toBe(401);
    }
  });
  it('exposes explicit demo source and rejects malformed scan parameters', async () => {
    const token = await createToken({ username: 'admin', role: 'admin' });
    const headers = { authorization: `Bearer ${token}` };
    const caps = await app.inject({ url: '/api/capabilities', headers });
    expect(caps.json().isDemo).toBe(true);
    expect(caps.json().capabilities).toContain('SCAN');
    expect((await app.inject({ url: '/api/keys?cursor=-1', headers })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/keys', headers: { ...headers, 'x-redisx-db': '1.5' } })).statusCode).toBe(400);
  });
  it('validates metric windows and returns actual comparison history', async () => {
    const token = await createToken({ username: 'admin', role: 'admin' });
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ url: '/api/metrics/history?range=invalid', headers })).statusCode).toBe(400);
    const response = await app.inject({ url: '/api/metrics/history?range=15m&compare=true', headers });
    expect(response.statusCode).toBe(200);
    const history = response.json();
    expect(history.previousPoints.length).toBeGreaterThan(0);
    expect(Math.max(...history.previousPoints.map((point: { timestamp: number }) => point.timestamp))).toBeLessThan(Math.min(...history.points.map((point: { timestamp: number }) => point.timestamp)));
  });
  it('prevents viewers from reading the audit log and writing through the sandbox', async () => {
    const token = await createToken({ username: 'viewer', role: 'viewer' });
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ url: '/api/audit', headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/playground/exec', headers, payload: { command: 'SET play:x y' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/playground/reset', headers })).statusCode).toBe(403);
  });
  it('rejects malformed mutation inputs instead of reporting false success', async () => {
    const token = await createToken({ username: 'admin', role: 'admin' });
    const headers = { authorization: `Bearer ${token}` };
    for (const [url, payload, method] of [
      ['/api/keys/create', { name: 'invalid', type: 'made-up', payload: {} }, 'POST'],
      ['/api/keys/create', { name: 'invalid', type: 'zset', payload: { members: [['a', 'not-a-score']] } }, 'POST'],
      ['/api/key/invalid/ttl', { ttl: 'forever' }, 'PUT'],
      ['/api/keys/delete', { keys: [123] }, 'POST'],
    ] as const) expect((await app.inject({ url, method, payload, headers })).statusCode).toBe(400);
  });
});
