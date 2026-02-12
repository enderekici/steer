/**
 * Tests for select action (src/actions/select.ts).
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

import { resolveElement } from '../../src/actions/resolve.js';
import { executeSelect } from '../../src/actions/select.js';

const mockResolveElement = vi.mocked(resolveElement);

function createMockSession() {
  return {
    id: 'test-session',
    page: {
      selectOption: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(0),
          click: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

function createMockElement(isSelect = true) {
  return {
    evaluate: vi.fn().mockResolvedValue(isSelect),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('executeSelect', () => {
  it('should use native selectOption for <select> elements', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    // getEffectiveSelector needs a selector or generate one
    element.evaluate
      .mockResolvedValueOnce(true) // isNativeSelect
      .mockResolvedValueOnce('#my-select'); // getEffectiveSelector
    mockResolveElement.mockResolvedValue(element);

    const result = await executeSelect(session, { selector: '#my-select' }, 'option1');

    expect(session.page.selectOption).toHaveBeenCalledWith('#my-select', 'option1');
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should handle custom dropdown select', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    element.evaluate.mockResolvedValueOnce(false); // not native select

    // Mock a successful option click
    const mockOption = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
    };
    session.page.locator.mockReturnValue({
      first: vi.fn().mockReturnValue(mockOption),
    });

    mockResolveElement.mockResolvedValue(element);

    const result = await executeSelect(session, { ref: 'r1' }, 'Option A');

    expect(element.click).toHaveBeenCalledWith({ timeout: 5000 });
    expect(session.page.waitForTimeout).toHaveBeenCalledWith(300);
    expect(mockOption.click).toHaveBeenCalledWith({ timeout: 3000 });
    expect(result.success).toBe(true);
  });

  it('should throw ActionError when custom dropdown option not found', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    element.evaluate.mockResolvedValueOnce(false);
    mockResolveElement.mockResolvedValue(element);

    // All option selectors fail
    const mockOption = {
      count: vi.fn().mockResolvedValue(0),
      click: vi.fn().mockResolvedValue(undefined),
    };
    session.page.locator.mockReturnValue({
      first: vi.fn().mockReturnValue(mockOption),
    });

    await expect(executeSelect(session, { ref: 'r1' }, 'Missing')).rejects.toThrow(ActionError);
    await expect(executeSelect(session, { ref: 'r1' }, 'Missing')).rejects.toThrow(
      'Could not find option',
    );
  });

  it('should try all option selectors in custom dropdown', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    element.evaluate.mockResolvedValueOnce(false);
    mockResolveElement.mockResolvedValue(element);

    let callCount = 0;
    const mockOption = {
      count: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount >= 3 ? 1 : 0); // Third selector matches
      }),
      click: vi.fn().mockResolvedValue(undefined),
    };
    session.page.locator.mockReturnValue({
      first: vi.fn().mockReturnValue(mockOption),
    });

    const result = await executeSelect(session, { ref: 'r1' }, 'Option B');
    expect(result.success).toBe(true);
    expect(session.page.locator).toHaveBeenCalledTimes(3);
  });

  it('should handle locator exception in custom dropdown', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    element.evaluate.mockResolvedValueOnce(false);
    mockResolveElement.mockResolvedValue(element);

    // First locator throws, rest return 0
    let callCount = 0;
    session.page.locator.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          first: vi.fn().mockReturnValue({
            count: vi.fn().mockRejectedValue(new Error('locator error')),
            click: vi.fn(),
          }),
        };
      }
      // Subsequent calls: some match
      if (callCount === 5) {
        return {
          first: vi.fn().mockReturnValue({
            count: vi.fn().mockResolvedValue(1),
            click: vi.fn().mockResolvedValue(undefined),
          }),
        };
      }
      return {
        first: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(0),
          click: vi.fn(),
        }),
      };
    });

    const result = await executeSelect(session, { ref: 'r1' }, 'Opt');
    expect(result.success).toBe(true);
  });

  it('should throw ActionError when selectOption fails on native select', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    element.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce('#sel');
    session.page.selectOption.mockRejectedValue(new Error('select failed'));
    mockResolveElement.mockResolvedValue(element);

    await expect(executeSelect(session, { selector: '#sel' }, 'val')).rejects.toThrow(ActionError);
    await expect(executeSelect(session, { selector: '#sel' }, 'val')).rejects.toThrow(
      'select failed',
    );
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    element.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce('#sel');
    const actionErr = new ActionError('select', 'custom');
    session.page.selectOption.mockRejectedValue(actionErr);
    mockResolveElement.mockResolvedValue(element);

    await expect(executeSelect(session, { selector: '#sel' }, 'val')).rejects.toBe(actionErr);
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    element.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce('#sel');
    session.page.selectOption.mockRejectedValue('string error');
    mockResolveElement.mockResolvedValue(element);

    await expect(executeSelect(session, { selector: '#sel' }, 'val')).rejects.toThrow(ActionError);
  });

  it('should generate selector from element with id', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    element.evaluate
      .mockResolvedValueOnce(true) // isNativeSelect
      .mockResolvedValueOnce('#generated-id'); // getEffectiveSelector (uses el.id)
    mockResolveElement.mockResolvedValue(element);

    await executeSelect(session, { ref: 'r1' }, 'val');
    expect(session.page.selectOption).toHaveBeenCalledWith('#generated-id', 'val');
  });

  it('should handle scrollIntoViewIfNeeded failure in custom dropdown', async () => {
    const session = createMockSession();
    const element = createMockElement(false);
    element.evaluate.mockResolvedValueOnce(false);
    element.scrollIntoViewIfNeeded.mockRejectedValue(new Error('fail'));
    mockResolveElement.mockResolvedValue(element);

    const mockOption = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
    };
    session.page.locator.mockReturnValue({
      first: vi.fn().mockReturnValue(mockOption),
    });

    const result = await executeSelect(session, { ref: 'r1' }, 'opt');
    expect(result.success).toBe(true);
  });

  it('should handle waitForLoadState timeout gracefully', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    element.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce('#sel');
    session.page.waitForLoadState.mockRejectedValue(new Error('timeout'));
    mockResolveElement.mockResolvedValue(element);

    const result = await executeSelect(session, { selector: '#sel' }, 'val');
    expect(result.success).toBe(true);
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    const element = createMockElement(true);
    element.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce('#sel');
    mockResolveElement.mockResolvedValue(element);
    session.refs.set('old', {} as any);

    await executeSelect(session, { selector: '#sel' }, 'val');
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
  });
});
