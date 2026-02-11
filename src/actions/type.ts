import type { ElementHandle } from 'playwright';
import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { ActionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { resolveElement, withRetry } from './resolve.js';
import type { ActionResult, ActionTarget } from './types.js';

async function isContentEditable(element: ElementHandle): Promise<boolean> {
  return element.evaluate((el) => (el as HTMLElement).isContentEditable ?? false);
}

export async function executeType(
  session: Session,
  target: ActionTarget,
  value: string,
): Promise<ActionResult> {
  const element = await resolveElement(session, target, 'type');

  try {
    await withRetry(
      async () => {
        await element.scrollIntoViewIfNeeded().catch(() => undefined);
        await element.click({ timeout: 5000 });

        const editable = await isContentEditable(element);

        if (editable) {
          await element.evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          });
          await session.page.keyboard.press('Delete');
          await element.type(value);
        } else {
          try {
            await element.fill(value);
          } catch {
            logger.warn(
              { sessionId: session.id },
              'fill() failed, falling back to triple-click + type',
            );
            await element.click({ clickCount: 3 });
            await session.page.keyboard.press('Delete');
            await element.type(value);
          }
        }
      },
      { retries: 1, actionName: 'type' },
    );
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError('type', message);
  }

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
