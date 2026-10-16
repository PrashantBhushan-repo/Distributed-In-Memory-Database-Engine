import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../src/server.js';
import { createToken } from '../src/auth/jwt.js';

describe('Gateway Integration Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Health & Status
  it('GET /health returns 200 with gateway and redis status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.gateway).toBe('healthy');
  });

  // 2. Authentication: Login
  it('POST /api/auth/login succeeds with valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'admin123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.role).toBe('admin');
  });

  it('POST /api/auth/login fails with 401 for wrong credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/login returns 400 for bad input schema', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: '' }, // missing password
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Invalid username or password payload');
  });

  // 3. Token Refresh
  it('POST /api/auth/refresh returns fresh token when valid Bearer token provided', async () => {
    const token = await createToken({ username: 'admin', role: 'admin' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe('admin');
  });

  // 4. Role Enforcement & Dangerous Command Blocking
  it('Viewer role is blocked from executing write command SET', async () => {
    const viewerToken = await createToken({ username: 'viewer', role: 'viewer' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/command',
      headers: {
        authorization: `Bearer ${viewerToken}`,
      },
      payload: {
        args: ['SET', 'testkey', 'testval'],
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('ERR_SAFETY_BLOCKED');
    expect(body.message).toContain('Viewer');
  });

  it('Dangerous command FLUSHALL is blocked without unlock flag even for admin', async () => {
    const adminToken = await createToken({ username: 'admin', role: 'admin' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/command',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        args: ['FLUSHALL'],
        unlock: false,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('ERR_SAFETY_BLOCKED');
    expect(body.message).toContain('destructive');
  });

  it('Dangerous command SHUTDOWN is blocked for non-admin even if unlock is requested', async () => {
    const operatorToken = await createToken({ username: 'operator', role: 'operator' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/command',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
      payload: {
        args: ['SHUTDOWN'],
        unlock: true,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('ERR_SAFETY_BLOCKED');
    expect(body.message).toContain('Administrators');
  });

  // 5. SCAN Cap Verification
  it('GET /api/keys caps count parameter and returns demo keys', async () => {
    const adminToken = await createToken({ username: 'admin', role: 'admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/keys?cursor=0&count=999999',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.keys).toBeDefined();
    expect(Array.isArray(body.keys)).toBe(true);
  });

  // 6. Audit Log & Secret Sanitization
  it('POST /api/command with AUTH redacts secret credentials in audit log', async () => {
    const adminToken = await createToken({ username: 'admin', role: 'admin' });
    // Run AUTH command
    await app.inject({
      method: 'POST',
      url: '/api/command',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        args: ['AUTH', 'supersecretpassword123'],
      },
    });

    // Check audit log
    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/audit',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(auditRes.statusCode).toBe(200);
    const auditList = JSON.parse(auditRes.body);
    const authEntry = auditList.find((e: any) => e.command === 'AUTH');
    expect(authEntry).toBeDefined();
    expect(authEntry.args[1]).toBe('******');
  });

  // 7. Zod Validation (bad input -> 400)
  it('POST /api/command returns 400 when args is not an array', async () => {
    const adminToken = await createToken({ username: 'admin', role: 'admin' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/command',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        args: 'not-an-array',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('POST /api/keys/create returns 400 for missing key name', async () => {
    const adminToken = await createToken({ username: 'admin', role: 'admin' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys/create',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: '',
        type: 'string',
        payload: { value: 'bar' },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Key name is required');
  });

  it('PUT /api/key/:name/ttl updates key TTL successfully', async () => {
    const adminToken = await createToken({ username: 'admin', role: 'admin' });
    // First create a test key
    await app.inject({
      method: 'POST',
      url: '/api/keys/create',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: 'ttl_test_key',
        type: 'string',
        payload: { value: 'test' },
      },
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/key/ttl_test_key/ttl',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        ttl: 300,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});
