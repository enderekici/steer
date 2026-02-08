import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { ActionError } from '../utils/errors.js';
import { resolveElement } from './resolve.js';
import type { ActionResult, ActionTarget } from './types.js';

export async function executeHover(session: Session, target: ActionTarget): Promise<ActionResult> {
  const element = await resolveElement(session, target, 'hover');

  try {
    await element.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await element.hover({ timeout: 3000 });

    // Brief wait for hover-triggered content (menus, tooltips)
    await session.page.waitForTimeout(300);
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError('hover', message);
  }

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
