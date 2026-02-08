import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { ActionError } from '../utils/errors.js';
import { sanitizeSelector } from '../utils/sanitize.js';
import type { ActionResult } from './types.js';

export interface WaitOptions {
  selector?: string;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
  timeout?: number;
}

const MAX_WAIT_TIMEOUT = 30_000;
const DEFAULT_WAIT_TIMEOUT = 5_000;

export async function executeWait(session: Session, options: WaitOptions): Promise<ActionResult> {
  const timeout = Math.min(options.timeout ?? DEFAULT_WAIT_TIMEOUT, MAX_WAIT_TIMEOUT);

  try {
    if (options.selector) {
      const safe = sanitizeSelector(options.selector);
      const state = options.state ?? 'visible';
      await session.page.waitForSelector(safe, { state, timeout });
    } else {
      // Default: wait for network idle
      await session.page.waitForLoadState('networkidle', { timeout });
    }
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError('wait', message);
  }

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
