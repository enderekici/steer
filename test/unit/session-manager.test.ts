/**
 * Tests for SessionManager (src/browser/session-manager.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionLimitError, SessionNotFoundError } from '../../src/utils/errors.js';

vi.mock('../../src/config.js', () => ({
  config: {
    maxSessions: 2,
    sessionTimeoutMs: 1000,
    viewportWidth: 1280,
    viewportHeight: 720,
    blockResources: [],
  },
}));

vi.mock('../../src/browser/session.js', () => ({
  Session: {
    create: vi.fn().mockImplementation(async () => {
      const id = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return {
        id,
        page: {
          url: vi.fn().mockReturnValue('about:blank'),
        },
        refs: new Map(),
        touch: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
        createdAt: Date.now(),
        lastActivity: Date.now(),
        isExpired: vi.fn().mockReturnValue(false),
      };
    }),
  },
}));

import { SessionManager } from '../../src/browser/session-manager.js';

function createMockEngine() {
  return {
    getBrowser: vi.fn().mockReturnValue({}),
    launch: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as any;
}

let manager: SessionManager;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  manager = new SessionManager(createMockEngine());
});

afterEach(() => {
  manager.stopCleanup();
  vi.useRealTimers();
});

describe('SessionManager', () => {
  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await manager.createSession();
      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
    });

    it('should throw SessionLimitError when max sessions reached', async () => {
      await manager.createSession();
      await manager.createSession();

      await expect(manager.createSession()).rejects.toThrow(SessionLimitError);
    });
  });

  describe('getSession', () => {
    it('should return a session by id', async () => {
      const session = await manager.createSession();
      const retrieved = manager.getSession(session.id);
      expect(retrieved.id).toBe(session.id);
      expect(session.touch).toHaveBeenCalled();
    });

    it('should throw SessionNotFoundError for unknown id', () => {
      expect(() => manager.getSession('nonexistent')).toThrow(SessionNotFoundError);
    });
  });

  describe('destroySession', () => {
    it('should destroy a session by id', async () => {
      const session = await manager.createSession();
      await manager.destroySession(session.id);

      expect(session.close).toHaveBeenCalled();
      expect(() => manager.getSession(session.id)).toThrow(SessionNotFoundError);
    });

    it('should throw SessionNotFoundError for unknown id', async () => {
      await expect(manager.destroySession('nonexistent')).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions', () => {
      const list = manager.listSessions();
      expect(list).toEqual([]);
    });

    it('should return session info for all sessions', async () => {
      await manager.createSession();
      await manager.createSession();

      const list = manager.listSessions();
      expect(list.length).toBe(2);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('url');
      expect(list[0]).toHaveProperty('createdAt');
      expect(list[0]).toHaveProperty('lastActivity');
    });
  });

  describe('destroyAll', () => {
    it('should destroy all sessions', async () => {
      const s1 = await manager.createSession();
      const s2 = await manager.createSession();

      await manager.destroyAll();

      expect(s1.close).toHaveBeenCalled();
      expect(s2.close).toHaveBeenCalled();
      expect(manager.listSessions().length).toBe(0);
    });

    it('should work when no sessions exist', async () => {
      await manager.destroyAll(); // Should not throw
    });
  });

  describe('cleanup', () => {
    it('should clean up expired sessions', async () => {
      const session = await manager.createSession();
      session.isExpired.mockReturnValue(true);

      // Trigger cleanup by advancing timer
      vi.advanceTimersByTime(30_000);

      expect(session.close).toHaveBeenCalled();
      expect(manager.listSessions().length).toBe(0);
    });

    it('should not clean up non-expired sessions', async () => {
      const session = await manager.createSession();
      session.isExpired.mockReturnValue(false);

      vi.advanceTimersByTime(30_000);

      expect(session.close).not.toHaveBeenCalled();
      expect(manager.listSessions().length).toBe(1);
    });

    it('should handle close errors during cleanup gracefully', async () => {
      const session = await manager.createSession();
      session.isExpired.mockReturnValue(true);
      session.close.mockRejectedValue(new Error('close failed'));

      vi.advanceTimersByTime(30_000);

      // Session should still be removed from the map even if close fails
      expect(manager.listSessions().length).toBe(0);
    });
  });

  describe('stopCleanup', () => {
    it('should stop the cleanup interval', async () => {
      manager.stopCleanup();
      // Should not throw and cleanup should not run
      const session = await manager.createSession();
      session.isExpired.mockReturnValue(true);

      vi.advanceTimersByTime(60_000);

      // Session should NOT be cleaned up because cleanup was stopped
      expect(session.close).not.toHaveBeenCalled();
    });
  });
});
