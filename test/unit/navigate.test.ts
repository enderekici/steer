/**
 * Tests for navigate action (src/actions/navigate.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionError, DomainNotAllowedError } from '../../src/utils/errors.js';

vi.mock('../../src/processing/snapshot.js', () => {
  const refMap = new Map();
  refMap.set('r1', { mockHandle: true });
  return {
    takeSnapshot: vi.fn().mockResolvedValue({
      snapshot: {
        url: 'http://example.com',
        title: 'Example',
        refs: [{ ref: 'r1', role: 'link', name: 'Test' }],
      },
      refMap,
    }),
  };
});

// We need to be able to control config.allowedDomains
vi.mock('../../src/config.js', () => ({
  config: {
    allowedDomains: [],
  },
}));

import { executeNavigate } from '../../src/actions/navigate.js';
import { config } from '../../src/config.js';

function createMockSession() {
  return {
    id: 'test-session',
    page: {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue('http://example.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  (config as any).allowedDomains = [];
});

describe('executeNavigate', () => {
  it('should navigate to a valid URL', async () => {
    const session = createMockSession();
    const result = await executeNavigate(session, 'https://example.com');

    expect(session.page.goto).toHaveBeenCalledWith('https://example.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should navigate with custom waitUntil', async () => {
    const session = createMockSession();
    await executeNavigate(session, 'https://example.com', 'networkidle');

    expect(session.page.goto).toHaveBeenCalledWith('https://example.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  });

  it('should navigate with waitUntil load', async () => {
    const session = createMockSession();
    await executeNavigate(session, 'https://example.com', 'load');

    expect(session.page.goto).toHaveBeenCalledWith('https://example.com/', {
      waitUntil: 'load',
      timeout: 30000,
    });
  });

  it('should throw ActionError when navigation fails', async () => {
    const session = createMockSession();
    session.page.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

    await expect(executeNavigate(session, 'https://example.com')).rejects.toThrow(ActionError);
    await expect(executeNavigate(session, 'https://example.com')).rejects.toThrow('Navigation to');
  });

  it('should throw DomainNotAllowedError for blocked domain', async () => {
    (config as any).allowedDomains = ['allowed.com'];
    const session = createMockSession();

    await expect(executeNavigate(session, 'https://blocked.com')).rejects.toThrow(
      DomainNotAllowedError,
    );
  });

  it('should allow exact domain match', async () => {
    (config as any).allowedDomains = ['example.com'];
    const session = createMockSession();

    const result = await executeNavigate(session, 'https://example.com/page');
    expect(result.success).toBe(true);
  });

  it('should allow subdomain match', async () => {
    (config as any).allowedDomains = ['example.com'];
    const session = createMockSession();

    const result = await executeNavigate(session, 'https://www.example.com/page');
    expect(result.success).toBe(true);
  });

  it('should allow all domains when allowedDomains is empty', async () => {
    (config as any).allowedDomains = [];
    const session = createMockSession();

    const result = await executeNavigate(session, 'https://anything.com');
    expect(result.success).toBe(true);
  });

  it('should reject invalid URLs', async () => {
    const session = createMockSession();
    await expect(executeNavigate(session, 'not-a-url')).rejects.toThrow();
  });

  it('should reject javascript: URLs', async () => {
    const session = createMockSession();
    await expect(executeNavigate(session, 'javascript:alert(1)')).rejects.toThrow();
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    session.refs.set('old', {} as any);

    await executeNavigate(session, 'https://example.com');
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
  });

  it('should handle non-Error throws from goto', async () => {
    const session = createMockSession();
    session.page.goto.mockRejectedValue('string error');

    await expect(executeNavigate(session, 'https://example.com')).rejects.toThrow(ActionError);
  });

  it('should block domain when allowedDomains is set and domain does not match', async () => {
    (config as any).allowedDomains = ['safe.com'];
    const session = createMockSession();

    await expect(executeNavigate(session, 'https://evil.org')).rejects.toThrow(
      DomainNotAllowedError,
    );
  });

  it('should not allow partial domain matches', async () => {
    (config as any).allowedDomains = ['example.com'];
    const session = createMockSession();

    // 'notexample.com' should NOT match 'example.com'
    await expect(executeNavigate(session, 'https://notexample.com')).rejects.toThrow(
      DomainNotAllowedError,
    );
  });
});
