import type { ElementHandle } from 'playwright';
import type { Session } from '../browser/session.js';
import { ActionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { sanitizeSelector } from '../utils/sanitize.js';
import type { ActionTarget } from './types.js';

/**
 * Resolve an element from a ref ID or CSS selector.
 * Provides clear error messages when refs are stale or missing.
 */
export async function resolveElement(
  session: Session,
  target: ActionTarget,
  actionName: string,
): Promise<ElementHandle> {
  let element: ElementHandle | null | undefined;

  if (target.ref) {
    element = session.getElementByRef(target.ref);
    if (!element) {
      const availableRefs = [...session.refs.keys()];
      const hint =
        availableRefs.length > 0
          ? ` Available refs: ${availableRefs.slice(0, 10).join(', ')}${availableRefs.length > 10 ? ` ... (${availableRefs.length} total)` : ''}`
          : ' No refs available — call observe first.';
      throw new ActionError(
        actionName,
        `Element ref "${target.ref}" not found in current snapshot.${hint}`,
      );
    }

    // Validate the element is still attached to the DOM
    const isAttached = await element.evaluate((el) => el.isConnected).catch(() => false);

    if (!isAttached) {
      throw new ActionError(
        actionName,
        `Element ref "${target.ref}" is stale (detached from DOM). Call observe to get fresh refs.`,
      );
    }
  } else if (target.selector) {
    const safe = sanitizeSelector(target.selector);
    element = await session.page.$(safe);
    if (!element) {
      throw new ActionError(actionName, `No element matches selector "${safe}"`);
    }
  } else {
    throw new ActionError(actionName, 'Either ref or selector must be provided');
  }

  return element;
}

/**
 * Run an async action with retry logic.
 * Retries on transient failures (timeouts, detached elements).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; actionName?: string } = {},
): Promise<T> {
  const maxRetries = options.retries ?? 1;
  const actionName = options.actionName ?? 'action';
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on transient errors
      const isTransient =
        lastError.message.includes('Timeout') ||
        lastError.message.includes('detached') ||
        lastError.message.includes('Target closed') ||
        lastError.message.includes('Execution context was destroyed');

      if (!isTransient || attempt >= maxRetries) {
        throw err;
      }

      logger.debug(
        { actionName, attempt: attempt + 1, error: lastError.message },
        'Retrying action after transient failure',
      );

      // Brief pause before retry
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  throw lastError;
}
