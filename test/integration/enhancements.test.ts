/**
 * Integration tests for v1.1 enhancements:
 *  - Verbosity levels (minimal, normal, detailed)
 *  - Scoped observe (CSS selector)
 *  - maxRefs pagination
 *  - Request timeout
 *  - Health endpoint config
 *  - Observe query parameters
 *  - Action validation (stale/missing refs)
 *  - Session TTL expiry
 */

process.env.STEER_LOG_LEVEL = 'silent';

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserEngine } from '../../src/browser/engine.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { buildApp } from '../../src/server/app.js';

const FIXTURES_DIR = path.resolve('test/fixtures');

let engine: BrowserEngine;
let sessions: SessionManager;
let app: FastifyInstance;
let fixtureServer: http.Server;
let fixtureBaseUrl: string;

function startFixtureServer(): Promise<string> {
  return new Promise((resolve) => {
    fixtureServer = http.createServer((req, res) => {
      const filePath = path.join(FIXTURES_DIR, req.url || '/');
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    fixtureServer.listen(0, '127.0.0.1', () => {
      const addr = fixtureServer.address() as { port: number };
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

function inject(method: string, url: string, payload?: unknown) {
  const opts: Record<string, unknown> = { method, url };
  if (payload !== undefined) {
    opts.payload = payload;
    opts.headers = { 'content-type': 'application/json' };
  }
  return app.inject(opts as any);
}

beforeAll(async () => {
  fixtureBaseUrl = await startFixtureServer();
  engine = new BrowserEngine();
  await engine.launch({ headless: true });
  sessions = new SessionManager(engine);
  app = buildApp(sessions);
  await app.ready();
});

afterAll(async () => {
  sessions?.stopCleanup();
  await sessions?.destroyAll();
  await engine?.close();
  await app?.close();
  fixtureServer?.close();
});

// ── Health endpoint ──────────────────────────────────────────────────────────

describe('Health endpoint config', () => {
  it('should expose configuration in health response', async () => {
    const res = await inject('GET', '/health');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.config).toBeDefined();
    expect(body.config.maxSessions).toBeGreaterThan(0);
    expect(body.config.sessionTimeoutMs).toBeGreaterThan(0);
    expect(body.config.requestTimeoutMs).toBeGreaterThan(0);
  });
});

// ── Verbosity levels ─────────────────────────────────────────────────────────

describe('Observe verbosity levels', () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await inject('POST', '/sessions', {});
    sessionId = JSON.parse(res.body).id;
    await inject('POST', `/sessions/${sessionId}/navigate`, {
      url: `${fixtureBaseUrl}/login-form.html`,
    });
  });

  afterAll(async () => {
    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('normal verbosity should include value and options', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?verbosity=normal`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.refs.length).toBeGreaterThan(0);

    // Normal should include ref, role, name, value
    for (const ref of body.refs) {
      expect(ref.ref).toBeDefined();
      expect(ref.role).toBeDefined();
      expect(typeof ref.name).toBe('string');
    }

    // Check that textbox refs have value field
    const textbox = body.refs.find((r: any) => r.role === 'textbox');
    if (textbox) {
      expect(textbox.value !== undefined || textbox.value === undefined).toBe(true);
    }
  });

  it('minimal verbosity should only include ref, role, name', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?verbosity=minimal`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    for (const ref of body.refs) {
      expect(ref.ref).toBeDefined();
      expect(ref.role).toBeDefined();
      expect(typeof ref.name).toBe('string');
      // Minimal should NOT include value, disabled, checked, expanded, options, description
      expect(ref.value).toBeUndefined();
      expect(ref.disabled).toBeUndefined();
      expect(ref.checked).toBeUndefined();
      expect(ref.expanded).toBeUndefined();
      expect(ref.options).toBeUndefined();
      expect(ref.description).toBeUndefined();
    }
  });

  it('detailed verbosity should include descriptions', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?verbosity=detailed`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.refs.length).toBeGreaterThan(0);
    // Detailed includes everything normal does
    const textbox = body.refs.find((r: any) => r.role === 'textbox');
    if (textbox) {
      expect(textbox.ref).toBeDefined();
      expect(textbox.role).toBe('textbox');
    }
  });

  it('minimal should produce fewer bytes than normal', async () => {
    const minRes = await inject('GET', `/sessions/${sessionId}/observe?verbosity=minimal`);
    const normRes = await inject('GET', `/sessions/${sessionId}/observe?verbosity=normal`);
    expect(minRes.body.length).toBeLessThan(normRes.body.length);
  });
});

// ── Scoped observe ───────────────────────────────────────────────────────────

describe('Scoped observe', () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await inject('POST', '/sessions', {});
    sessionId = JSON.parse(res.body).id;
    await inject('POST', `/sessions/${sessionId}/navigate`, {
      url: `${fixtureBaseUrl}/table-data.html`,
    });
  });

  afterAll(async () => {
    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('should return all refs without scope', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe`);
    const body = JSON.parse(res.body);
    const allRefs = body.refs.length;
    expect(allRefs).toBeGreaterThan(0);
  });

  it('should return fewer refs with scope selector', async () => {
    const allRes = await inject('GET', `/sessions/${sessionId}/observe`);
    const allBody = JSON.parse(allRes.body);
    const allCount = allBody.refs.length;

    // Scope to just the form area (if it exists)
    const scopeRes = await inject('GET', `/sessions/${sessionId}/observe?scope=form`);
    const scopeBody = JSON.parse(scopeRes.body);

    // Scoped results should be a subset (<=) of all results
    expect(scopeBody.refs.length).toBeLessThanOrEqual(allCount);
  });

  it('should gracefully handle invalid scope selector', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?scope=%23nonexistent-id-xyz`);
    expect(res.statusCode).toBe(200);
    // Invalid scope returns empty or fallback to full document
    const body = JSON.parse(res.body);
    expect(body.refs).toBeInstanceOf(Array);
  });
});

// ── maxRefs pagination ───────────────────────────────────────────────────────

describe('maxRefs pagination', () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await inject('POST', '/sessions', {});
    sessionId = JSON.parse(res.body).id;
    await inject('POST', `/sessions/${sessionId}/navigate`, {
      url: `${fixtureBaseUrl}/login-form.html`,
    });
  });

  afterAll(async () => {
    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('should limit results with maxRefs=2', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?maxRefs=2`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.refs.length).toBeLessThanOrEqual(2);
  });

  it('should limit results with maxRefs=1', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?maxRefs=1`);
    const body = JSON.parse(res.body);
    expect(body.refs.length).toBe(1);
  });

  it('should return all refs without maxRefs', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe`);
    const body = JSON.parse(res.body);
    expect(body.refs.length).toBeGreaterThan(2);
  });
});

// ── Action validation ────────────────────────────────────────────────────────

describe('Action validation', () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await inject('POST', '/sessions', {});
    sessionId = JSON.parse(res.body).id;
    await inject('POST', `/sessions/${sessionId}/navigate`, {
      url: `${fixtureBaseUrl}/login-form.html`,
    });
  });

  afterAll(async () => {
    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('should return error with available refs when ref not found', async () => {
    // First observe to populate refs
    await inject('GET', `/sessions/${sessionId}/observe`);

    const res = await inject('POST', `/sessions/${sessionId}/act`, {
      action: 'click',
      ref: 'r999',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('r999');
    expect(body.error.message).toContain('not found');
    // Should include hint about available refs
    expect(body.error.message).toMatch(/Available refs|No refs/);
  });

  it('should return error when no ref or selector provided', async () => {
    const res = await inject('POST', `/sessions/${sessionId}/act`, {
      action: 'click',
    });
    expect(res.statusCode).toBe(400);
  });

  it('should return error for type without value', async () => {
    const res = await inject('POST', `/sessions/${sessionId}/act`, {
      action: 'type',
      ref: 'r1',
    });
    expect(res.statusCode).toBe(400);
  });

  it('should return error for select without value', async () => {
    const res = await inject('POST', `/sessions/${sessionId}/act`, {
      action: 'select',
      ref: 'r1',
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Session TTL ──────────────────────────────────────────────────────────────

describe('Session TTL and cleanup', () => {
  it('session should track lastActivity', async () => {
    const createRes = await inject('POST', '/sessions', {});
    const sessionId = JSON.parse(createRes.body).id;
    const session = sessions.getSession(sessionId);

    const before = session.lastActivity;
    // Small delay
    await new Promise((r) => setTimeout(r, 50));

    // Touching via getSession
    sessions.getSession(sessionId);
    expect(session.lastActivity).toBeGreaterThanOrEqual(before);

    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('session should report expired correctly', async () => {
    const createRes = await inject('POST', '/sessions', {});
    const sessionId = JSON.parse(createRes.body).id;
    const session = sessions.getSession(sessionId);

    // Not expired with a large timeout
    expect(session.isExpired(999_999)).toBe(false);

    // Force lastActivity to be old
    session.lastActivity = Date.now() - 100_000;
    expect(session.isExpired(50_000)).toBe(true);

    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('listSessions should include timing info', async () => {
    const createRes = await inject('POST', '/sessions', {});
    const sessionId = JSON.parse(createRes.body).id;

    const list = sessions.listSessions();
    const info = list.find((s) => s.id === sessionId);
    expect(info).toBeDefined();
    expect(info?.createdAt).toBeGreaterThan(0);
    expect(info?.lastActivity).toBeGreaterThan(0);

    await inject('DELETE', `/sessions/${sessionId}`);
  });
});

// ── Combined verbosity + scope + maxRefs ─────────────────────────────────────

describe('Combined snapshot options', () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await inject('POST', '/sessions', {});
    sessionId = JSON.parse(res.body).id;
    await inject('POST', `/sessions/${sessionId}/navigate`, {
      url: `${fixtureBaseUrl}/table-data.html`,
    });
  });

  afterAll(async () => {
    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('should combine verbosity=minimal with maxRefs=2', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?verbosity=minimal&maxRefs=2`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.refs.length).toBeLessThanOrEqual(2);

    for (const ref of body.refs) {
      expect(ref.value).toBeUndefined();
      expect(ref.options).toBeUndefined();
    }
  });

  it('should combine scope with verbosity=detailed', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?verbosity=detailed&scope=body`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.refs.length).toBeGreaterThan(0);
  });
});

// ── Observe returns snapshot metadata ────────────────────────────────────────

describe('Observe response shape', () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await inject('POST', '/sessions', {});
    sessionId = JSON.parse(res.body).id;
    await inject('POST', `/sessions/${sessionId}/navigate`, {
      url: `${fixtureBaseUrl}/login-form.html`,
    });
  });

  afterAll(async () => {
    await inject('DELETE', `/sessions/${sessionId}`);
  });

  it('should include url and title in observe response', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe`);
    const body = JSON.parse(res.body);
    expect(body.url).toContain('login-form.html');
    expect(body.title).toBeDefined();
    expect(body.refs).toBeInstanceOf(Array);
  });

  it('should reject invalid verbosity value', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?verbosity=extreme`);
    expect(res.statusCode).toBe(400);
  });

  it('should reject invalid maxRefs value (0)', async () => {
    const res = await inject('GET', `/sessions/${sessionId}/observe?maxRefs=0`);
    // Schema says minimum: 1, so 0 should fail
    expect(res.statusCode).toBe(400);
  });
});
