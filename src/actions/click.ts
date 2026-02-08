import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { ActionError } from '../utils/errors.js';
import { resolveElement, withRetry } from './resolve.js';
import type { ActionResult, ActionTarget } from './types.js';

export async function executeClick(session: Session, target: ActionTarget): Promise<ActionResult> {
  const element = await resolveElement(session, target, 'click');

  try {
    await withRetry(
      async () => {
        await element.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await element
          .click({ timeout: 3000 })
          .catch(() => element.click({ force: true, timeout: 3000 }));
      },
      { retries: 1, actionName: 'click' },
    );

    await session.page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError('click', message);
  }

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
