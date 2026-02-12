/**
 * Tests for dialog action (src/actions/dialog.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';

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

import { executeDialogConfig, installDialogHandler } from '../../src/actions/dialog.js';

function createMockSession() {
  const listeners: Record<string, Function[]> = {};
  return {
    page: {
      on: vi.fn((event: string, handler: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      removeAllListeners: vi.fn(),
      url: vi.fn().mockReturnValue('http://test.com'),
      _listeners: listeners,
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

describe('installDialogHandler', () => {
  it('should install a dialog handler with default accept config', () => {
    const session = createMockSession();
    installDialogHandler(session);
    expect(session.page.removeAllListeners).toHaveBeenCalledWith('dialog');
    expect(session.page.on).toHaveBeenCalledWith('dialog', expect.any(Function));
  });

  it('should accept dialogs when action is accept', async () => {
    const session = createMockSession();
    installDialogHandler(session, { action: 'accept' });

    const mockDialog = {
      accept: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
    };

    // Trigger the dialog handler
    const handler = session.page._listeners.dialog[0];
    await handler(mockDialog);

    expect(mockDialog.accept).toHaveBeenCalledWith(undefined);
    expect(mockDialog.dismiss).not.toHaveBeenCalled();
  });

  it('should accept dialogs with promptText', async () => {
    const session = createMockSession();
    installDialogHandler(session, { action: 'accept', promptText: 'my answer' });

    const mockDialog = {
      accept: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
    };

    const handler = session.page._listeners.dialog[0];
    await handler(mockDialog);

    expect(mockDialog.accept).toHaveBeenCalledWith('my answer');
  });

  it('should dismiss dialogs when action is dismiss', async () => {
    const session = createMockSession();
    installDialogHandler(session, { action: 'dismiss' });

    const mockDialog = {
      accept: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
    };

    const handler = session.page._listeners.dialog[0];
    await handler(mockDialog);

    expect(mockDialog.dismiss).toHaveBeenCalled();
    expect(mockDialog.accept).not.toHaveBeenCalled();
  });

  it('should store dialogConfig on session', () => {
    const session = createMockSession();
    installDialogHandler(session, { action: 'dismiss' });
    expect((session as any).dialogConfig).toEqual({ action: 'dismiss' });
  });

  it('should fall back to accept when dialogConfig is cleared', async () => {
    const session = createMockSession();
    installDialogHandler(session, { action: 'accept' });

    // Clear dialogConfig to test the ?? fallback
    (session as any).dialogConfig = undefined;

    const mockDialog = {
      accept: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
    };

    const handler = session.page._listeners.dialog[0];
    await handler(mockDialog);

    expect(mockDialog.accept).toHaveBeenCalledWith(undefined);
    expect(mockDialog.dismiss).not.toHaveBeenCalled();
  });
});

describe('executeDialogConfig', () => {
  it('should install dialog handler and return snapshot', async () => {
    const session = createMockSession();
    const result = await executeDialogConfig(session, { action: 'accept' });
    expect(result.success).toBe(true);
    expect(session.page.removeAllListeners).toHaveBeenCalledWith('dialog');
    expect(session.touch).toHaveBeenCalled();
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    session.refs.set('old', {} as any);
    await executeDialogConfig(session, { action: 'dismiss' });
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
    expect(session.refs.size).toBe(1);
  });
});
