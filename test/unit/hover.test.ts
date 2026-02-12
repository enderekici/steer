/**
 * Tests for hover action (src/actions/hover.ts).
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

vi.mock('../../src/actions/resolve.js', () => ({
  resolveElement: vi.fn(),
}));

import { executeHover } from '../../src/actions/hover.js';
import { resolveElement } from '../../src/actions/resolve.js';

const mockResolveElement = vi.mocked(resolveElement);

function createMockSession() {
  return {
    page: {
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

function createMockElement() {
  return {
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('executeHover', () => {
  it('should scroll into view and hover the element', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);

    const result = await executeHover(session, { ref: 'r1' });

    expect(mockResolveElement).toHaveBeenCalledWith(session, { ref: 'r1' }, 'hover');
    expect(element.scrollIntoViewIfNeeded).toHaveBeenCalled();
    expect(element.hover).toHaveBeenCalledWith({ timeout: 3000 });
    expect(session.page.waitForTimeout).toHaveBeenCalledWith(300);
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should handle scrollIntoViewIfNeeded failure gracefully', async () => {
    const session = createMockSession();
    const element = createMockElement();
    element.scrollIntoViewIfNeeded.mockRejectedValue(new Error('not scrollable'));
    mockResolveElement.mockResolvedValue(element);

    const result = await executeHover(session, { selector: '.btn' });
    expect(result.success).toBe(true);
  });

  it('should throw ActionError when hover fails', async () => {
    const session = createMockSession();
    const element = createMockElement();
    element.hover.mockRejectedValue(new Error('hover failed'));
    mockResolveElement.mockResolvedValue(element);

    await expect(executeHover(session, { ref: 'r1' })).rejects.toThrow(ActionError);
    await expect(executeHover(session, { ref: 'r1' })).rejects.toThrow('hover failed');
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    const element = createMockElement();
    const actionErr = new ActionError('hover', 'custom');
    element.hover.mockRejectedValue(actionErr);
    mockResolveElement.mockResolvedValue(element);

    await expect(executeHover(session, { ref: 'r1' })).rejects.toBe(actionErr);
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    const element = createMockElement();
    element.hover.mockRejectedValue('string error');
    mockResolveElement.mockResolvedValue(element);

    await expect(executeHover(session, { ref: 'r1' })).rejects.toThrow(ActionError);
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);
    session.refs.set('old', {} as any);

    await executeHover(session, { ref: 'r1' });
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
    expect(session.refs.size).toBe(1);
  });
});
