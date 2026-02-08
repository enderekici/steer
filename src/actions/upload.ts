import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { ActionError } from '../utils/errors.js';
import { resolveElement } from './resolve.js';
import type { ActionResult, ActionTarget } from './types.js';

export async function executeUpload(
  session: Session,
  target: ActionTarget,
  filePaths: string[],
): Promise<ActionResult> {
  if (!filePaths || filePaths.length === 0) {
    throw new ActionError('upload', 'At least one file path is required');
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
