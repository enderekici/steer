import type { ElementHandle } from "playwright";
import type { Session } from "../browser/session.js";
import type { ActionTarget, ActionResult } from "./types.js";
import { ActionError } from "../utils/errors.js";
import { sanitizeSelector } from "../utils/sanitize.js";
import { takeSnapshot } from "../processing/snapshot.js";


async function resolveElement(
  session: Session,
  target: ActionTarget,
): Promise<ElementHandle> {
  let element: ElementHandle | null | undefined;

  if (target.ref) {
    element = session.getElementByRef(target.ref);
    if (!element) {
      throw new ActionError("click", `Element ref "${target.ref}" not found in current snapshot`);
    }
  } else if (target.selector) {
    const safe = sanitizeSelector(target.selector);
    element = await session.page.$(safe);
    if (!element) {
      throw new ActionError("click", `No element matches selector "${safe}"`);
    }
  } else {
    throw new ActionError("click", "Either ref or selector must be provided");
  }

  return element;
}

export async function executeClick(
  session: Session,
  target: ActionTarget,
): Promise<ActionResult> {
  const element = await resolveElement(session, target);

  try {
    // Scroll element into view
    await element.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {
      // Element may already be in view or not scrollable
    });

    // Try a normal click first — fall back to force click quickly.
    // In headless/container environments, Playwright's actionability checks
    // (visible, stable, enabled) can stall indefinitely, so we keep timeouts
    // tight and rely on force:true as the reliable fallback.
    await element.click({ timeout: 3000 }).catch(() =>
      element.click({ force: true, timeout: 3000 }),
    );

    // Wait briefly for any navigation or network activity to settle
    await session.page
      .waitForLoadState("domcontentloaded", { timeout: 3000 })
      .catch(() => {
        // No navigation happened -- that's fine
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError("click", message);
  }

  // Take a fresh snapshot and update session refs
  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return {
    success: true,
    snapshot,
    url: session.page.url(),
  };
}
