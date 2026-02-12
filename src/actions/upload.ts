import path from 'node:path';
import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { ActionError } from '../utils/errors.js';
import { resolveElement } from './resolve.js';
import type { ActionResult, ActionTarget } from './types.js';

/** System directories that must never be accessed via file upload. */
const BLOCKED_PREFIXES = ['/etc', '/proc', '/sys', '/dev', '/var/run'];

/**
 * Validate that a file path does not contain path traversal sequences or
 * point to sensitive system directories.
 */
function validateFilePath(filePath: string): void {
  // Reject path traversal
  if (filePath.includes('..')) {
    throw new ActionError('upload', `Path traversal not allowed: ${filePath}`);
  }

  // Normalise so that tricks like /etc/../etc are caught
  const normalised = path.resolve(filePath);

  for (const prefix of BLOCKED_PREFIXES) {
    if (normalised.startsWith(`${prefix}/`) || normalised === prefix) {
      throw new ActionError('upload', `Access to ${prefix} is not allowed`);
    }
  }
}

export async function executeUpload(
  session: Session,
  target: ActionTarget,
  filePaths: string[],
): Promise<ActionResult> {
  if (!filePaths || filePaths.length === 0) {
    throw new ActionError('upload', 'At least one file path is required');
  }

  // Validate every path before touching the browser
  for (const fp of filePaths) {
    validateFilePath(fp);
  }

  const element = await resolveElement(session, target, 'upload');

  try {
    await element.setInputFiles(filePaths);
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError('upload', message);
  }

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
