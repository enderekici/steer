/**
 * Tests for upload action (src/actions/upload.ts).
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
import { executeUpload } from '../../src/actions/upload.js';

const mockResolveElement = vi.mocked(resolveElement);

function createMockSession() {
  return {
    page: {
      url: vi.fn().mockReturnValue('http://test.com'),
    },
    refs: new Map(),
    touch: vi.fn(),
  } as any;
}

function createMockElement() {
  return {
    setInputFiles: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('executeUpload', () => {
  it('should upload files to a file input', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);

    const result = await executeUpload(session, { ref: 'r1' }, ['/tmp/file.txt']);

    expect(mockResolveElement).toHaveBeenCalledWith(session, { ref: 'r1' }, 'upload');
    expect(element.setInputFiles).toHaveBeenCalledWith(['/tmp/file.txt']);
    expect(result.success).toBe(true);
    expect(session.touch).toHaveBeenCalled();
  });

  it('should upload multiple files', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);

    await executeUpload(session, { selector: 'input[type=file]' }, ['/a.txt', '/b.txt']);
    expect(element.setInputFiles).toHaveBeenCalledWith(['/a.txt', '/b.txt']);
  });

  it('should throw ActionError when filePaths is empty', async () => {
    const session = createMockSession();
    await expect(executeUpload(session, { ref: 'r1' }, [])).rejects.toThrow(ActionError);
    await expect(executeUpload(session, { ref: 'r1' }, [])).rejects.toThrow(
      'At least one file path is required',
    );
  });

  it('should throw ActionError when filePaths is falsy', async () => {
    const session = createMockSession();
    await expect(executeUpload(session, { ref: 'r1' }, null as any)).rejects.toThrow(ActionError);
  });

  it('should throw ActionError when setInputFiles fails', async () => {
    const session = createMockSession();
    const element = createMockElement();
    element.setInputFiles.mockRejectedValue(new Error('not a file input'));
    mockResolveElement.mockResolvedValue(element);

    await expect(executeUpload(session, { ref: 'r1' }, ['/f.txt'])).rejects.toThrow(ActionError);
    await expect(executeUpload(session, { ref: 'r1' }, ['/f.txt'])).rejects.toThrow(
      'not a file input',
    );
  });

  it('should re-throw ActionError as-is', async () => {
    const session = createMockSession();
    const element = createMockElement();
    const actionErr = new ActionError('upload', 'custom');
    element.setInputFiles.mockRejectedValue(actionErr);
    mockResolveElement.mockResolvedValue(element);

    await expect(executeUpload(session, { ref: 'r1' }, ['/f.txt'])).rejects.toBe(actionErr);
  });

  it('should handle non-Error throws', async () => {
    const session = createMockSession();
    const element = createMockElement();
    element.setInputFiles.mockRejectedValue('string error');
    mockResolveElement.mockResolvedValue(element);

    await expect(executeUpload(session, { ref: 'r1' }, ['/f.txt'])).rejects.toThrow(ActionError);
  });

  it('should clear and repopulate refs from refMap', async () => {
    const session = createMockSession();
    const element = createMockElement();
    mockResolveElement.mockResolvedValue(element);
    session.refs.set('old', {} as any);

    await executeUpload(session, { ref: 'r1' }, ['/f.txt']);
    expect(session.refs.has('old')).toBe(false);
    expect(session.refs.has('r1')).toBe(true);
  });
});
