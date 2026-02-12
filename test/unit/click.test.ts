/**
 * Tests for click action (src/actions/click.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { executeClick } from '../../src/actions/click.js';
import { resolveElement, withRetry } from '../../src/actions/resolve.js';

const mockResolveElement = vi.mocked(resolveElement);
const mockWithRetry = vi.mocked(withRetry);

beforeEach(() => {
  vi.clearAllMocks();
  mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) => fn() as any);
});

function createMockSession() {
  return {
    page: {
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

function createMockElement() {
  return {
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('executeClick', () => {
  it('should resolve element and click it', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);

    const result = await executeClick(session, { ref: 'r1' });

    expect(mockResolveElement).toHaveBeenCalledWith(session, { ref: 'r1' }, 'click');
    expect(mockWithRetry).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should handle waitForLoadState failure gracefully', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);
    session.page.waitForLoadState.mockRejectedValue(new Error('timeout'));

    const result = await executeClick(session, { ref: 'r1' });
    expect(result.success).toBe(true);
  });

  it('should throw ActionError when withRetry re-throws non-ActionError', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);
    mockWithRetry.mockRejectedValue(new Error('click failed'));

    await expect(executeClick(session, { ref: 'r1' })).rejects.toThrow(ActionError);
    await expect(executeClick(session, { ref: 'r1' })).rejects.toThrow('click failed');
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);
    const actionErr = new ActionError('click', 'custom');
    mockWithRetry.mockRejectedValue(actionErr);

    await expect(executeClick(session, { ref: 'r1' })).rejects.toBe(actionErr);
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);
    mockWithRetry.mockRejectedValue('string error');

    await expect(executeClick(session, { ref: 'r1' })).rejects.toThrow(ActionError);
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);
    session.refs.set('old', {} as any);

    await executeClick(session, { ref: 'r1' });
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
  });

  it('should fall back to force click when normal click fails', async () => {
    const session = createMockSession();
    const element = createMockElement();
    // First click rejects, then force click succeeds
    element.click
      .mockRejectedValueOnce(new Error('click intercepted'))
      .mockResolvedValueOnce(undefined);
    mockResolveElement.mockResolvedValue(element);

    const result = await executeClick(session, { ref: 'r1' });

    expect(element.click).toHaveBeenCalledTimes(2);
    expect(element.click).toHaveBeenNthCalledWith(1, { timeout: 3000 });
    expect(element.click).toHaveBeenNthCalledWith(2, { force: true, timeout: 3000 });
    expect(result.success).toBe(true);
  });
});
