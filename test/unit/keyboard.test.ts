/**
 * Tests for keyboard action (src/actions/keyboard.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';
import { ActionError } from '../../src/utils/errors.js';

// Mock takeSnapshot
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

import { executeKeyboard } from '../../src/actions/keyboard.js';

function createMockSession() {
  return {
    page: {
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

describe('executeKeyboard', () => {
  it('should press a valid named key (Enter)', async () => {
    const session = createMockSession();
    const result = await executeKeyboard(session, 'Enter');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Enter');
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should press Escape', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Escape');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Escape');
  });

  it('should press Tab', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Tab');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Tab');
  });

  it('should press Backspace', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Backspace');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Backspace');
  });

  it('should press function keys (F1-F12)', async () => {
    const session = createMockSession();
    for (const key of ['F1', 'F5', 'F12']) {
      await executeKeyboard(session, key);
      expect(session.page.keyboard.press).toHaveBeenCalledWith(key);
    }
  });

  it('should press arrow keys', async () => {
    const session = createMockSession();
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      await executeKeyboard(session, key);
    }
    expect(session.page.keyboard.press).toHaveBeenCalledTimes(4);
  });

  it('should press Home, End, PageUp, PageDown', async () => {
    const session = createMockSession();
    for (const key of ['Home', 'End', 'PageUp', 'PageDown']) {
      await executeKeyboard(session, key);
    }
    expect(session.page.keyboard.press).toHaveBeenCalledTimes(4);
  });

  it('should press Delete key', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Delete');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Delete');
  });

  it('should press Space key by name', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Space');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Space');
  });

  it('should press space character', async () => {
    const session = createMockSession();
    await executeKeyboard(session, ' ');
    expect(session.page.keyboard.press).toHaveBeenCalledWith(' ');
  });

  it('should press modifier+key combinations', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Control+a');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Control+a');
  });

  it('should press Alt+key combinations', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Alt+F4');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Alt+F4');
  });

  it('should press Shift+key combinations', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Shift+a');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Shift+a');
  });

  it('should press Meta+key combinations', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'Meta+c');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('Meta+c');
  });

  it('should press single printable ASCII characters', async () => {
    const session = createMockSession();
    await executeKeyboard(session, 'a');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('a');
  });

  it('should press digits', async () => {
    const session = createMockSession();
    await executeKeyboard(session, '5');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('5');
  });

  it('should press special printable characters', async () => {
    const session = createMockSession();
    await executeKeyboard(session, '~');
    expect(session.page.keyboard.press).toHaveBeenCalledWith('~');
  });

  it('should throw ActionError for invalid keys', async () => {
    const session = createMockSession();
    await expect(executeKeyboard(session, '')).rejects.toThrow(ActionError);
    await expect(executeKeyboard(session, '')).rejects.toThrow('Invalid key');
  });

  it('should throw ActionError for multi-char non-modifier strings', async () => {
    const session = createMockSession();
    await expect(executeKeyboard(session, 'abc')).rejects.toThrow(ActionError);
  });

  it('should throw ActionError when press fails', async () => {
    const session = createMockSession();
    session.page.keyboard.press.mockRejectedValue(new Error('key press failed'));
    await expect(executeKeyboard(session, 'Enter')).rejects.toThrow(ActionError);
    await expect(executeKeyboard(session, 'Enter')).rejects.toThrow('key press failed');
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    const actionErr = new ActionError('keyboard', 'custom error');
    session.page.keyboard.press.mockRejectedValue(actionErr);
    await expect(executeKeyboard(session, 'Enter')).rejects.toBe(actionErr);
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    session.page.keyboard.press.mockRejectedValue('string error');
    await expect(executeKeyboard(session, 'Enter')).rejects.toThrow(ActionError);
  });

  it('should handle waitForLoadState failure gracefully', async () => {
    const session = createMockSession();
    session.page.waitForLoadState.mockRejectedValue(new Error('timeout'));
    // waitForLoadState has .catch(() => undefined), so it should not throw
    const result = await executeKeyboard(session, 'Enter');
    expect(result.success).toBe(true);
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    session.refs.set('old', {} as any);
    const result = await executeKeyboard(session, 'a');
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
    expect(session.refs.size).toBe(1);
    expect(result.success).toBe(true);
  });
});
