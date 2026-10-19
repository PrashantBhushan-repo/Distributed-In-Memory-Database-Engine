import assert from 'node:assert/strict';
import { Redis } from 'ioredis';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Run against an isolated real C++ process, never the synthetic backend.
Object.assign(process.env, { NODE_ENV: 'test', DEMO_MODE: 'false', DEMO_FALLBACK: 'false',
  REDIS_HOST: process.env.ENGINE_HOST || '127.0.0.1', REDIS_PORT: process.env.ENGINE_PORT || '16379',
  REDIS_PASSWORD: process.env.ENGINE_PASSWORD || '', LOG_LEVEL: 'error' });
const { app, redisClient, metricsSampler } = await import('../dist/server.js');
const direct = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined, maxRetriesPerRequest: 1, retryStrategy: () => null });
direct.on('error', () => {});
const prefix = `studio-verify:${Date.now()}:`;
let passed = 0;
const verified = label => { passed++; console.log(`PASS ${label}`); };
try {
  await app.ready();
  await direct.ping();
  for (let count = 0; count < 50 && redisClient.getStatus().status !== 'connected'; count++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(redisClient.getStatus().status, 'connected'); assert.equal(redisClient.getStatus().isDemo, false);
  verified('live C++ engine connected, demo disabled');
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: process.env.ADMIN_PASS || 'admin123' } });
  assert.equal(login.statusCode, 200); const token = login.json().token;
  const headers = { authorization: `Bearer ${token}` };
  const request = async (method, url, payload, db = 0) => {
    const result = await app.inject({ method, url, payload, headers: { ...headers, 'x-redisx-db': String(db) } });
    assert.equal(result.statusCode, 200, `${method} ${url}: ${result.body}`); return result.json();
  };
  assert.equal((await app.inject({ url: '/api/info' })).statusCode, 401); verified('anonymous engine access denied');
  redisClient.useDemo();
  const connected = await request('POST', '/api/connection/connect', { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT), password: process.env.REDIS_PASSWORD, tls: false });
  assert.equal(connected.capabilitiesState, 'ready');
  assert.ok(connected.capabilities.includes('SCAN'));
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(redisClient.getStatus().status, 'connected');
  assert.ok(redisClient.getStatus().capabilities.includes('SCAN'));
  verified('switching from demo waits for live capabilities and ignores retired socket events');
  const info = await request('GET', '/api/info');
  const rawInfo = await direct.info();
  assert.equal(info.server.process_id, Number(rawInfo.match(/process_id:(\d+)/)[1])); verified('API server identity matches native INFO');
  for (const [type, payload, expected] of [
    ['string', { value: 'from the browser ✓' }, 'from the browser ✓'],
    ['list', { items: ['one', 'two'] }, undefined],
    ['hash', { entries: { name: 'Ada', role: 'engineer' } }, undefined],
    ['set', { members: ['red', 'blue'] }, undefined],
    ['zset', { members: [['Ada', 42]] }, undefined],
  ]) {
    const name = prefix + type;
    await request('POST', '/api/keys/create', { name, type, payload });
    assert.equal(await direct.type(name), type);
    const detail = await request('GET', `/api/key/${encodeURIComponent(name)}`);
    assert.equal(detail.type, type); if (expected) assert.equal(detail.value, expected);
    verified(`${type} creation and detail read reach C++ storage`);
  }
  const name = prefix + 'string';
  await request('PUT', `/api/key/${encodeURIComponent(name)}`, { value: 'saved', ttl: 120 });
  assert.equal(await direct.get(name), 'saved'); assert.ok(await direct.ttl(name) > 100);
  const expiration = await direct.pttl(name);
  await new Promise(resolve => setTimeout(resolve, 1100));
  await request('PUT', `/api/key/${encodeURIComponent(name)}`, { value: 'saved with expiration', keepTtl: true });
  assert.ok(await direct.pttl(name) < expiration - 500, 'Editing must preserve the existing expiration deadline.');
  await request('PUT', `/api/key/${encodeURIComponent(name)}/ttl`, { ttl: -1 }); assert.equal(await direct.ttl(name), -1);
  verified('editing, expiration, and persistence agree with direct RESP reads');
  await Promise.all([request('PUT', `/api/key/${encodeURIComponent(prefix + 'isolated')}`, { value: 'db1' }, 1), request('PUT', `/api/key/${encodeURIComponent(prefix + 'isolated')}`, { value: 'db2' }, 2)]);
  assert.equal((await request('GET', `/api/key/${encodeURIComponent(prefix + 'isolated')}`, undefined, 1)).value, 'db1');
  assert.equal((await request('GET', `/api/key/${encodeURIComponent(prefix + 'isolated')}`, undefined, 2)).value, 'db2');
  assert.equal(await direct.get(prefix + 'isolated'), null); verified('concurrent database selections remain isolated');
  const scan = await request('GET', `/api/keys?match=${prefix}*&count=1000`);
  assert.ok(scan.keys.some(key => key.name === name)); verified('SCAN lists real engine keys');
  await metricsSampler.collectSample();
  const sample = metricsSampler.getLatestSample();
  assert.equal(sample.p99LatencyMs, null); assert.ok(sample.timestamp > 0);
  assert.ok(Number.isFinite(sample.infoLatencyMs) && sample.infoLatencyMs >= 0);
  assert.equal(sample.networkAvailable, true);
  assert.ok(['engine', 'gateway'].includes(sample.networkScope));
  assert.equal(sample.usedMemory, (await request('GET', '/api/info')).memory.used_memory);
  verified('telemetry uses measured memory and omits unsupported percentiles');
  const sandboxKey = `play:${prefix}greeting`;
  await request('POST', '/api/playground/exec', { command: `SET ${sandboxKey} sandbox`, db: 15 });
  await direct.select(15); assert.equal(await direct.get(sandboxKey), 'sandbox'); await direct.del(sandboxKey); await direct.select(0);
  assert.equal((await app.inject({ method: 'POST', url: '/api/playground/exec', headers, payload: { command: 'FLUSHDB', db: 15 } })).statusCode, 400);
  verified('playground executes on real DB15 and blocks global commands');
  const support = [];
  for (const route of ['/api/commands', '/api/dbsize', '/api/keys/tree', '/api/memory/overview', '/api/memory/top-keys',
    '/api/expiration/soonest', '/api/expiration/histogram', '/api/expiration/stats', '/api/clients', '/api/slowlog',
    '/api/persistence', '/api/replication', '/api/replication/preflight', '/api/acl/users', '/api/security/status', '/api/config', '/api/pubsub/channels']) {
    const result = await app.inject({ url: route, headers });
    assert.ok([200, 501].includes(result.statusCode), `${route}: unexpected ${result.statusCode} ${result.body}`);
    support.push({ route, status: result.statusCode, available: result.statusCode === 200 });
    console.log(`${result.statusCode === 200 ? 'LIVE' : 'UNSUPPORTED'} ${route}`);
  }
  const output = path.resolve(import.meta.dirname, '../../../build-studio-verify');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'api-support.json'), JSON.stringify(support, null, 2));
  verified('all administrative read routes return real data or an explicit unsupported response');
  await request('DELETE', `/api/key/${encodeURIComponent(name)}`); assert.equal(await direct.exists(name), 0); verified('UI deletion removes the native engine key');
  console.log(`Verified ${passed} live engine checks.`);
} finally {
  for (const db of [0, 1, 2]) {
    try { await direct.select(db); let cursor = '0'; do { const page = await direct.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 1000); cursor = page[0]; if (page[1].length) await direct.del(...page[1]); } while (cursor !== '0'); } catch { /* Preserve the original error if the engine stopped. */ }
  }
  direct.disconnect(); await app.close();
}
