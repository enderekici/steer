/**
 * Tests for type action (src/actions/type.ts).
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

import { resolveElement, withRetry } from '../../src/actions/resolve.js';
import { executeType } from '../../src/actions/type.js';

const mockResolveElement = vi.mocked(resolveElement);
const mockWithRetry = vi.mocked(withRetry);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset withRetry to default behavior (just run the function)
  mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) => fn() as any);
});

function createMockSession() {
  return {
    page: {
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
    id: 'test-session',
  } as any;
}

function createMockElement(isContentEditable = false) {
  return {
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(isContentEditable),
    fill: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('executeType', () => {
  it('should type into a regular input using fill()', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    mockResolveElement.mockResolvedValue(element);

    const result = await executeType(session, { ref: 'r1' }, 'hello');

    expect(mockResolveElement).toHaveBeenCalledWith(session, { ref: 'r1' }, 'type');
    expect(element.fill).toHaveBeenCalledWith('hello');
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should type into a contenteditable element', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    mockResolveElement.mockResolvedValue(element);

    const result = await executeType(session, { ref: 'r1' }, 'hello');

    // For contenteditable: evaluate selects all, then press Delete, then type
    expect(element.evaluate).toHaveBeenCalledTimes(2); // once for isContentEditable, once for select all
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Delete');
    expect(element.type).toHaveBeenCalledWith('hello');
    expect(result.success).toBe(true);
  });

  it('should fall back to triple-click + type when fill fails', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    element.fill.mockRejectedValue(new Error('not fillable'));
    mockResolveElement.mockResolvedValue(element);

    const result = await executeType(session, { ref: 'r1' }, 'fallback');

    expect(element.click).toHaveBeenCalledWith({ clickCount: 3 });
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Delete');
    expect(element.type).toHaveBeenCalledWith('fallback');
    expect(result.success).toBe(true);
  });

  it('should throw ActionError when withRetry re-throws', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    mockResolveElement.mockResolvedValue(element);
    mockWithRetry.mockRejectedValue(new Error('type failed'));

    await expect(executeType(session, { ref: 'r1' }, 'x')).rejects.toThrow(ActionError);
    await expect(executeType(session, { ref: 'r1' }, 'x')).rejects.toThrow('type failed');
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    mockResolveElement.mockResolvedValue(element);
    const actionErr = new ActionError('type', 'custom');
    mockWithRetry.mockRejectedValue(actionErr);

    await expect(executeType(session, { ref: 'r1' }, 'x')).rejects.toBe(actionErr);
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    mockResolveElement.mockResolvedValue(element);
    mockWithRetry.mockRejectedValue('string error');

    await expect(executeType(session, { ref: 'r1' }, 'x')).rejects.toThrow(ActionError);
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    mockResolveElement.mockResolvedValue(element);
    session.refs.set('old', {} as any);

    await executeType(session, { ref: 'r1' }, 'hello');
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
  });

  it('should scroll element into view before typing', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    mockResolveElement.mockResolvedValue(element);

    await executeType(session, { ref: 'r1' }, 'test');
    expect(element.scrollIntoViewIfNeeded).toHaveBeenCalled();
  });

  it('should handle scrollIntoViewIfNeeded failure gracefully', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    element.scrollIntoViewIfNeeded.mockRejectedValue(new Error('not scrollable'));
    mockResolveElement.mockResolvedValue(element);

    const result = await executeType(session, { ref: 'r1' }, 'test');
    expect(result.success).toBe(true);
  });
});
