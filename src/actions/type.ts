import type { ElementHandle } from "playwright";
import type { Session } from "../browser/session.js";
import type { ActionTarget, ActionResult } from "./types.js";
import { ActionError } from "../utils/errors.js";
import { sanitizeSelector } from "../utils/sanitize.js";
import { takeSnapshot } from "../processing/snapshot.js";
import { logger } from "../utils/logger.js";

async function resolveElement(
  session: Session,
  target: ActionTarget,
): Promise<ElementHandle> {
  let element: ElementHandle | null | undefined;

  if (target.ref) {
    element = session.getElementByRef(target.ref);
    if (!element) {
      throw new ActionError("type", `Element ref "${target.ref}" not found in current snapshot`);
    }
  } else if (target.selector) {
    const safe = sanitizeSelector(target.selector);
    element = await session.page.$(safe);
    if (!element) {
      throw new ActionError("type", `No element matches selector "${safe}"`);
    }
  } else {
    throw new ActionError("type", "Either ref or selector must be provided");
  }

  return element;
}

async function isContentEditable(element: ElementHandle): Promise<boolean> {
  return element.evaluate(
    (el) => (el as HTMLElement).isContentEditable ?? false,
  );
}

export async function executeType(
  session: Session,
  target: ActionTarget,
  value: string,
): Promise<ActionResult> {
  const element = await resolveElement(session, target);

  try {
    // Scroll into view
    await element.scrollIntoViewIfNeeded().catch(() => {});

    // Click to focus the element
    await element.click({ timeout: 5000 });

    const editable = await isContentEditable(element);

    if (editable) {
      // For contenteditable elements, select-all then type replacement
      await element.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      await session.page.keyboard.press("Delete");
      await element.type(value);
    } else {
      // For standard input / textarea elements, use fill() which is
      // faster and more reliable than type()
      try {
        await element.fill(value);
      } catch {
        // fill() can fail on some non-standard inputs; fall back to
        // manual clear + type
        logger.warn(
          { sessionId: session.id },
          "fill() failed, falling back to triple-click + type",
        );
        // Triple-click selects all text in the field
        await element.click({ clickCount: 3 });
        await session.page.keyboard.press("Delete");
        await element.type(value);
      }
    }
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError("type", message);
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
