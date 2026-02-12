/**
 * Tests for wait action (src/actions/wait.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';
import { ActionError } from '../../src/utils/errors.js';

vi.mock('../../src/processing/snapshot.js', () => {
  const refMap = new Map();
  refMap.set('r1', { mockHandle: true });
  return {
    takeSnapshot: vi.fn().mockResolvedValue({
      snapshot: {
        url: 'http://test.com',
        title: 'Test',
        refs: [{ ref: 'r1', role: 'button', name: 'Test' }],
      },
      refMap,
    }),
  };
});

import { executeWait } from '../../src/actions/wait.js';

function createMockSession() {
  return {
    page: {
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

describe('executeWait', () => {
  it('should wait for a selector with default visible state', async () => {
    const session = createMockSession();
    const result = await executeWait(session, { selector: '.loaded' });
    expect(session.page.waitForSelector).toHaveBeenCalledWith('.loaded', {
      state: 'visible',
      timeout: 5000,
    });
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should wait for a selector with custom state', async () => {
    const session = createMockSession();
    await executeWait(session, { selector: '#elem', state: 'hidden' });
    expect(session.page.waitForSelector).toHaveBeenCalledWith('#elem', {
      state: 'hidden',
      timeout: 5000,
    });
  });

  it('should wait for networkidle when no selector is provided', async () => {
    const session = createMockSession();
    await executeWait(session, {});
    expect(session.page.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 5000 });
  });

  it('should use custom timeout', async () => {
    const session = createMockSession();
    await executeWait(session, { selector: '.item', timeout: 10000 });
    expect(session.page.waitForSelector).toHaveBeenCalledWith('.item', {
      state: 'visible',
      timeout: 10000,
    });
  });

  it('should cap timeout at MAX_WAIT_TIMEOUT (30000)', async () => {
    const session = createMockSession();
    await executeWait(session, { selector: '.item', timeout: 60000 });
    expect(session.page.waitForSelector).toHaveBeenCalledWith('.item', {
      state: 'visible',
      timeout: 30000,
    });
  });

  it('should default timeout to 5000 when not provided', async () => {
    const session = createMockSession();
    await executeWait(session, {});
    expect(session.page.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 5000 });
  });

  it('should throw ActionError when waitForSelector fails', async () => {
    const session = createMockSession();
    session.page.waitForSelector.mockRejectedValue(new Error('Timeout waiting for selector'));
    await expect(executeWait(session, { selector: '.missing' })).rejects.toThrow(ActionError);
    await expect(executeWait(session, { selector: '.missing' })).rejects.toThrow(
      'Timeout waiting for selector',
    );
  });

  it('should throw ActionError when waitForLoadState fails', async () => {
    const session = createMockSession();
    session.page.waitForLoadState.mockRejectedValue(new Error('Network timeout'));
    await expect(executeWait(session, {})).rejects.toThrow(ActionError);
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    const actionErr = new ActionError('wait', 'custom');
    session.page.waitForSelector.mockRejectedValue(actionErr);
    await expect(executeWait(session, { selector: '.x' })).rejects.toBe(actionErr);
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    session.page.waitForSelector.mockRejectedValue('string error');
    await expect(executeWait(session, { selector: '.x' })).rejects.toThrow(ActionError);
  });

  it('should wait with state attached', async () => {
    const session = createMockSession();
    await executeWait(session, { selector: '#el', state: 'attached' });
    expect(session.page.waitForSelector).toHaveBeenCalledWith('#el', {
      state: 'attached',
      timeout: 5000,
    });
  });

  it('should wait with state detached', async () => {
    const session = createMockSession();
    await executeWait(session, { selector: '#el', state: 'detached' });
    expect(session.page.waitForSelector).toHaveBeenCalledWith('#el', {
      state: 'detached',
      timeout: 5000,
    });
  });

  it('should clear and repopulate refs after wait', async () => {
    const session = createMockSession();
    session.refs.set('old', {} as any);
    await executeWait(session, {});
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
  });
});
