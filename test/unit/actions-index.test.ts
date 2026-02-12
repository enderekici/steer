/**
 * Tests for the action dispatcher (src/actions/index.ts).
 * We mock all individual action executors to test routing and validation.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionError, ValidationError } from '../../src/utils/errors.js';

// Mock all action modules
vi.mock('../../src/actions/click.js', () => ({
  executeClick: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/type.js', () => ({
  executeType: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/select.js', () => ({
  executeSelect: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/scroll.js', () => ({
  executeScroll: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/navigate.js', () => ({
  executeNavigate: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/wait.js', () => ({
  executeWait: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/keyboard.js', () => ({
  executeKeyboard: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/hover.js', () => ({
  executeHover: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/upload.js', () => ({
  executeUpload: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
}));
vi.mock('../../src/actions/dialog.js', () => ({
  executeDialogConfig: vi
    .fn()
    .mockResolvedValue({ success: true, snapshot: { url: '', title: '', refs: [] }, url: '' }),
  installDialogHandler: vi.fn(),
}));

import { executeClick } from '../../src/actions/click.js';
import { executeDialogConfig } from '../../src/actions/dialog.js';
import { executeHover } from '../../src/actions/hover.js';
import { executeAction } from '../../src/actions/index.js';
import { executeKeyboard } from '../../src/actions/keyboard.js';
import { executeNavigate } from '../../src/actions/navigate.js';
import { executeScroll } from '../../src/actions/scroll.js';
import { executeSelect } from '../../src/actions/select.js';
import { executeType } from '../../src/actions/type.js';
import { executeUpload } from '../../src/actions/upload.js';
import { executeWait } from '../../src/actions/wait.js';

const mockSession = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeAction', () => {
  // ── click ──
  describe('click', () => {
    it('should dispatch click action with target', async () => {
      const target = { ref: 'r1' };
      await executeAction(mockSession, 'click', { target });
      expect(executeClick).toHaveBeenCalledWith(mockSession, target);
    });

    it('should throw ValidationError if target is missing', async () => {
      await expect(executeAction(mockSession, 'click', {})).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if target has no ref or selector', async () => {
      await expect(executeAction(mockSession, 'click', { target: {} })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // ── type ──
  describe('type', () => {
    it('should dispatch type action with target and value', async () => {
      const target = { selector: '#input' };
      await executeAction(mockSession, 'type', { target, value: 'hello' });
      expect(executeType).toHaveBeenCalledWith(mockSession, target, 'hello');
    });

    it('should throw ValidationError if value is undefined', async () => {
      await expect(executeAction(mockSession, 'type', { target: { ref: 'r1' } })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError if value is null', async () => {
      await expect(
        executeAction(mockSession, 'type', { target: { ref: 'r1' }, value: null as any }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if target is missing', async () => {
      await expect(executeAction(mockSession, 'type', { value: 'hello' })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // ── select ──
  describe('select', () => {
    it('should dispatch select action with target and value', async () => {
      const target = { ref: 'r2' };
      await executeAction(mockSession, 'select', { target, value: 'option1' });
      expect(executeSelect).toHaveBeenCalledWith(mockSession, target, 'option1');
    });

    it('should throw ValidationError if value is undefined', async () => {
      await expect(executeAction(mockSession, 'select', { target: { ref: 'r1' } })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError if value is null', async () => {
      await expect(
        executeAction(mockSession, 'select', { target: { ref: 'r1' }, value: null as any }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if target is missing', async () => {
      await expect(executeAction(mockSession, 'select', { value: 'opt' })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // ── scroll ──
  describe('scroll', () => {
    it('should dispatch scroll with default direction "down"', async () => {
      await executeAction(mockSession, 'scroll', {});
      expect(executeScroll).toHaveBeenCalledWith(mockSession, 'down', undefined);
    });

    it('should dispatch scroll with explicit direction', async () => {
      await executeAction(mockSession, 'scroll', { direction: 'up' });
      expect(executeScroll).toHaveBeenCalledWith(mockSession, 'up', undefined);
    });

    it('should dispatch scroll with target', async () => {
      const target = { ref: 'r5' };
      await executeAction(mockSession, 'scroll', { direction: 'left', target });
      expect(executeScroll).toHaveBeenCalledWith(mockSession, 'left', target);
    });

    it('should throw ValidationError for invalid scroll direction', async () => {
      await expect(
        executeAction(mockSession, 'scroll', { direction: 'diagonal' as any }),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── navigate ──
  describe('navigate', () => {
    it('should dispatch navigate with url', async () => {
      await executeAction(mockSession, 'navigate', { url: 'https://example.com' });
      expect(executeNavigate).toHaveBeenCalledWith(mockSession, 'https://example.com', undefined);
    });

    it('should dispatch navigate with url and waitUntil', async () => {
      await executeAction(mockSession, 'navigate', {
        url: 'https://example.com',
        waitUntil: 'networkidle',
      });
      expect(executeNavigate).toHaveBeenCalledWith(
        mockSession,
        'https://example.com',
        'networkidle',
      );
    });

    it('should throw ValidationError if url is missing', async () => {
      await expect(executeAction(mockSession, 'navigate', {})).rejects.toThrow(ValidationError);
    });
  });

  // ── wait ──
  describe('wait', () => {
    it('should dispatch wait with options', async () => {
      await executeAction(mockSession, 'wait', {
        selector: '.loaded',
        state: 'visible',
        timeout: 5000,
      });
      expect(executeWait).toHaveBeenCalledWith(mockSession, {
        selector: '.loaded',
        state: 'visible',
        timeout: 5000,
      });
    });

    it('should dispatch wait with no options', async () => {
      await executeAction(mockSession, 'wait', {});
      expect(executeWait).toHaveBeenCalledWith(mockSession, {
        selector: undefined,
        state: undefined,
        timeout: undefined,
      });
    });
  });

  // ── keyboard ──
  describe('keyboard', () => {
    it('should dispatch keyboard with key', async () => {
      await executeAction(mockSession, 'keyboard', { key: 'Enter' });
      expect(executeKeyboard).toHaveBeenCalledWith(mockSession, 'Enter');
    });

    it('should throw ValidationError if key is missing', async () => {
      await expect(executeAction(mockSession, 'keyboard', {})).rejects.toThrow(ValidationError);
    });
  });

  // ── hover ──
  describe('hover', () => {
    it('should dispatch hover with target', async () => {
      const target = { ref: 'r3' };
      await executeAction(mockSession, 'hover', { target });
      expect(executeHover).toHaveBeenCalledWith(mockSession, target);
    });

    it('should throw ValidationError if target is missing', async () => {
      await expect(executeAction(mockSession, 'hover', {})).rejects.toThrow(ValidationError);
    });
  });

  // ── upload ──
  describe('upload', () => {
    it('should dispatch upload with target and filePaths', async () => {
      const target = { ref: 'r4' };
      await executeAction(mockSession, 'upload', { target, filePaths: ['/tmp/file.txt'] });
      expect(executeUpload).toHaveBeenCalledWith(mockSession, target, ['/tmp/file.txt']);
    });

    it('should throw ValidationError if filePaths is missing', async () => {
      await expect(executeAction(mockSession, 'upload', { target: { ref: 'r1' } })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError if filePaths is empty', async () => {
      await expect(
        executeAction(mockSession, 'upload', { target: { ref: 'r1' }, filePaths: [] }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if target is missing', async () => {
      await expect(
        executeAction(mockSession, 'upload', { filePaths: ['/tmp/file.txt'] }),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── dialog ──
  describe('dialog', () => {
    it('should dispatch dialog with default accept action', async () => {
      await executeAction(mockSession, 'dialog', {});
      expect(executeDialogConfig).toHaveBeenCalledWith(mockSession, {
        action: 'accept',
        promptText: undefined,
      });
    });

    it('should dispatch dialog with explicit dismiss action', async () => {
      await executeAction(mockSession, 'dialog', { dialogAction: 'dismiss' });
      expect(executeDialogConfig).toHaveBeenCalledWith(mockSession, {
        action: 'dismiss',
        promptText: undefined,
      });
    });

    it('should dispatch dialog with accept and promptText', async () => {
      await executeAction(mockSession, 'dialog', {
        dialogAction: 'accept',
        promptText: 'my answer',
      });
      expect(executeDialogConfig).toHaveBeenCalledWith(mockSession, {
        action: 'accept',
        promptText: 'my answer',
      });
    });
  });

  // ── unknown action ──
  describe('unknown action', () => {
    it('should throw ActionError for unknown actions', async () => {
      await expect(executeAction(mockSession, 'flyToMoon', {})).rejects.toThrow(ActionError);
      await expect(executeAction(mockSession, 'flyToMoon', {})).rejects.toThrow(
        'Unknown action "flyToMoon"',
      );
    });
  });
});
