import type { Session } from "../browser/session.js";
import type { ActionTarget, ActionResult } from "./types.js";
import { ActionError } from "../utils/errors.js";
import { sanitizeSelector } from "../utils/sanitize.js";
import { takeSnapshot } from "../processing/snapshot.js";

const SCROLL_AMOUNT = 500;

type ScrollDirection = "up" | "down" | "left" | "right";

function scrollDelta(direction: ScrollDirection): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: -SCROLL_AMOUNT };
    case "down":
      return { x: 0, y: SCROLL_AMOUNT };
    case "left":
      return { x: -SCROLL_AMOUNT, y: 0 };
    case "right":
      return { x: SCROLL_AMOUNT, y: 0 };
  }
}

export async function executeScroll(
  session: Session,
  direction: ScrollDirection,
  target?: ActionTarget,
): Promise<ActionResult> {
  try {
    if (target && (target.ref || target.selector)) {
      // Scroll a specific element into view
      let element;

      if (target.ref) {
        element = session.getElementByRef(target.ref);
        if (!element) {
          throw new ActionError(
            "scroll",
            `Element ref "${target.ref}" not found in current snapshot`,
          );
        }
      } else if (target.selector) {
        const safe = sanitizeSelector(target.selector);
        element = await session.page.$(safe);
        if (!element) {
          throw new ActionError(
            "scroll",
            `No element matches selector "${safe}"`,
          );
        }
      }

      if (element) {
        await element.scrollIntoViewIfNeeded();
      }
    } else {
      // Scroll the page in the requested direction
      const { x, y } = scrollDelta(direction);
      await session.page.evaluate(
        ([dx, dy]) => {
          window.scrollBy(dx, dy);
        },
        [x, y] as const,
      );
    }

    // Brief wait for lazy-loaded content to appear
    await session.page.waitForTimeout(400);
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError("scroll", message);
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
