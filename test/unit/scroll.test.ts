/**
 * Tests for scroll action (src/actions/scroll.ts).
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

import { executeScroll } from '../../src/actions/scroll.js';

function createMockSession() {
  return {
    page: {
      evaluate: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      $: vi.fn().mockResolvedValue(null),
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
    getElementByRef: vi.fn().mockReturnValue(undefined),
  } as any;
}

describe('executeScroll', () => {
  it('should scroll page down without target', async () => {
    const session = createMockSession();
    const result = await executeScroll(session, 'down');

    expect(session.page.evaluate).toHaveBeenCalled();
    expect(session.page.waitForTimeout).toHaveBeenCalledWith(400);
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should scroll page up without target', async () => {
    const session = createMockSession();
    await executeScroll(session, 'up');
    expect(session.page.evaluate).toHaveBeenCalled();
  });

  it('should scroll page left without target', async () => {
    const session = createMockSession();
    await executeScroll(session, 'left');
    expect(session.page.evaluate).toHaveBeenCalled();
  });

  it('should scroll page right without target', async () => {
    const session = createMockSession();
    await executeScroll(session, 'right');
    expect(session.page.evaluate).toHaveBeenCalled();
  });

  it('should scroll element into view by ref', async () => {
    const session = createMockSession();
    const mockElement = {
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    };
    session.getElementByRef.mockReturnValue(mockElement);

    const result = await executeScroll(session, 'down', { ref: 'r5' });

    expect(session.getElementByRef).toHaveBeenCalledWith('r5');
    expect(mockElement.scrollIntoViewIfNeeded).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('should throw ActionError when ref is not found', async () => {
    const session = createMockSession();
    session.getElementByRef.mockReturnValue(undefined);

    await expect(executeScroll(session, 'down', { ref: 'r99' })).rejects.toThrow(ActionError);
    await expect(executeScroll(session, 'down', { ref: 'r99' })).rejects.toThrow(
      'Element ref "r99" not found',
    );
  });

  it('should scroll element into view by selector', async () => {
    const session = createMockSession();
    const mockElement = {
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    };
    session.page.$.mockResolvedValue(mockElement);

    const result = await executeScroll(session, 'down', { selector: '.item' });

    expect(session.page.$).toHaveBeenCalledWith('.item');
    expect(mockElement.scrollIntoViewIfNeeded).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('should throw ActionError when selector matches nothing', async () => {
    const session = createMockSession();
    session.page.$.mockResolvedValue(null);

    await expect(executeScroll(session, 'down', { selector: '.missing' })).rejects.toThrow(
      ActionError,
    );
    await expect(executeScroll(session, 'down', { selector: '.missing' })).rejects.toThrow(
      'No element matches selector',
    );
  });

  it('should scroll page when target has no ref or selector', async () => {
    const session = createMockSession();
    await executeScroll(session, 'down', {});
    expect(session.page.evaluate).toHaveBeenCalled();
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    session.getElementByRef.mockReturnValue(undefined);

    try {
      await executeScroll(session, 'down', { ref: 'r99' });
    } catch (err) {
      expect(err).toBeInstanceOf(ActionError);
    }
  });

  it('should throw ActionError for non-ActionError errors', async () => {
    const session = createMockSession();
    session.page.evaluate.mockRejectedValue(new Error('eval failed'));

    await expect(executeScroll(session, 'down')).rejects.toThrow(ActionError);
    await expect(executeScroll(session, 'down')).rejects.toThrow('eval failed');
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    session.page.evaluate.mockRejectedValue('string error');

    await expect(executeScroll(session, 'down')).rejects.toThrow(ActionError);
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    session.refs.set('old', {} as any);

    await executeScroll(session, 'down');
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
  });
});
