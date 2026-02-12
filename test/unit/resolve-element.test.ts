/**
 * Tests for resolveElement function (src/actions/resolve.ts).
 * The withRetry function is already tested in resolve.test.ts.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';
import { resolveElement } from '../../src/actions/resolve.js';
import { ActionError } from '../../src/utils/errors.js';

function createMockSession(
  opts: { refElement?: any; selectorElement?: any; refsMap?: Map<string, any> } = {},
) {
  const refs = opts.refsMap ?? new Map();
  if (opts.refElement) {
    refs.set('r1', opts.refElement);
  }

  return {
    page: {
      $: vi.fn().mockResolvedValue(opts.selectorElement ?? null),
    },
    refs,
    getElementByRef: vi.fn((ref: string) => refs.get(ref)),
  } as any;
}

describe('resolveElement', () => {
  it('should resolve element by ref', async () => {
    const mockElement = {
      evaluate: vi.fn().mockResolvedValue(true), // isConnected
    };
    const session = createMockSession({ refElement: mockElement });

    const result = await resolveElement(session, { ref: 'r1' }, 'click');
    expect(result).toBe(mockElement);
  });

  it('should throw ActionError when ref is not found', async () => {
    const session = createMockSession({});

    await expect(resolveElement(session, { ref: 'r99' }, 'click')).rejects.toThrow(ActionError);
    await expect(resolveElement(session, { ref: 'r99' }, 'click')).rejects.toThrow(
      'Element ref "r99" not found',
    );
  });

  it('should include available refs in error hint', async () => {
    const refs = new Map();
    refs.set('r1', {});
    refs.set('r2', {});
    const session = createMockSession({ refsMap: refs });

    try {
      await resolveElement(session, { ref: 'r99' }, 'click');
    } catch (err: any) {
      expect(err.message).toContain('Available refs: r1, r2');
    }
  });

  it('should show "No refs available" when refs map is empty', async () => {
    const session = createMockSession({});

    try {
      await resolveElement(session, { ref: 'r99' }, 'click');
    } catch (err: any) {
      expect(err.message).toContain('No refs available');
    }
  });

  it('should truncate available refs hint when more than 10', async () => {
    const refs = new Map();
    for (let i = 1; i <= 15; i++) {
      refs.set(`r${i}`, {});
    }
    const session = createMockSession({ refsMap: refs });

    try {
      await resolveElement(session, { ref: 'r99' }, 'click');
    } catch (err: any) {
      expect(err.message).toContain('15 total');
    }
  });

  it('should throw ActionError when ref element is stale (detached)', async () => {
    const mockElement = {
      evaluate: vi.fn().mockResolvedValue(false), // not connected
    };
    const session = createMockSession({ refElement: mockElement });

    await expect(resolveElement(session, { ref: 'r1' }, 'click')).rejects.toThrow(ActionError);
    await expect(resolveElement(session, { ref: 'r1' }, 'click')).rejects.toThrow('stale');
  });

  it('should throw ActionError when evaluate throws (element detached)', async () => {
    const mockElement = {
      evaluate: vi.fn().mockRejectedValue(new Error('detached')),
    };
    const session = createMockSession({ refElement: mockElement });

    await expect(resolveElement(session, { ref: 'r1' }, 'click')).rejects.toThrow(ActionError);
    await expect(resolveElement(session, { ref: 'r1' }, 'click')).rejects.toThrow('stale');
  });

  it('should resolve element by selector', async () => {
    const mockElement = {};
    const session = createMockSession({ selectorElement: mockElement });

    const result = await resolveElement(session, { selector: '.btn' }, 'click');
    expect(result).toBe(mockElement);
    expect(session.page.$).toHaveBeenCalledWith('.btn');
  });

  it('should throw ActionError when selector matches nothing', async () => {
    const session = createMockSession({});

    await expect(resolveElement(session, { selector: '.missing' }, 'click')).rejects.toThrow(
      ActionError,
    );
    await expect(resolveElement(session, { selector: '.missing' }, 'click')).rejects.toThrow(
      'No element matches selector',
    );
  });

  it('should throw ActionError when neither ref nor selector provided', async () => {
    const session = createMockSession({});

    await expect(resolveElement(session, {}, 'click')).rejects.toThrow(ActionError);
    await expect(resolveElement(session, {}, 'click')).rejects.toThrow(
      'Either ref or selector must be provided',
    );
  });

  it('should include action name in error messages', async () => {
    const session = createMockSession({});

    try {
      await resolveElement(session, {}, 'hover');
    } catch (err: any) {
      expect(err.message).toContain('hover');
    }
  });
});
