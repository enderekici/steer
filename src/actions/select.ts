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
      throw new ActionError("select", `Element ref "${target.ref}" not found in current snapshot`);
    }
  } else if (target.selector) {
    const safe = sanitizeSelector(target.selector);
    element = await session.page.$(safe);
    if (!element) {
      throw new ActionError("select", `No element matches selector "${safe}"`);
    }
  } else {
    throw new ActionError("select", "Either ref or selector must be provided");
  }

  return element;
}

async function isNativeSelect(element: ElementHandle): Promise<boolean> {
  return element.evaluate(
    (el) => (el as unknown as Element).tagName.toLowerCase() === "select",
  );
}

async function getEffectiveSelector(
  target: ActionTarget,
  element: ElementHandle,
): Promise<string> {
  // If we already have a CSS selector, use it directly
  if (target.selector) {
    return sanitizeSelector(target.selector);
  }

  // Generate a selector from the element for use with page.selectOption()
  const generated: string = await element.evaluate((node) => {
    const el = node as unknown as Element;
    if (el.id) return `#${el.id}`;
    if (el.getAttribute("name")) {
      return `${el.tagName.toLowerCase()}[name="${el.getAttribute("name")}"]`;
    }
    // Fallback: walk up and build a path
    const path: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body) {
      let seg = current.tagName.toLowerCase();
      if (current.id) {
        seg = `#${current.id}`;
        path.unshift(seg);
        break;
      }
      const parent: Element | null = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current!.tagName,
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(seg);
      current = parent;
    }
    return path.join(" > ");
  });

  return generated;
}

export async function executeSelect(
  session: Session,
  target: ActionTarget,
  value: string,
): Promise<ActionResult> {
  const element = await resolveElement(session, target);

  try {
    const isNative = await isNativeSelect(element);

    if (isNative) {
      // Use Playwright's built-in selectOption for native <select> elements
      const selector = await getEffectiveSelector(target, element);
      await session.page.selectOption(selector, value);
    } else {
      // Custom dropdown: click to open, then find and click the matching option
      logger.info(
        { sessionId: session.id, value },
        "Handling custom dropdown select",
      );

      // Click the dropdown trigger to open it
      await element.scrollIntoViewIfNeeded().catch(() => {});
      await element.click({ timeout: 5000 });

      // Brief wait for dropdown animation / rendering
      await session.page.waitForTimeout(300);

      // Look for an option matching the value -- try several common patterns
      const optionSelectors = [
        `[role="option"]:has-text("${value}")`,
        `[role="listbox"] >> text="${value}"`,
        `li:has-text("${value}")`,
        `[data-value="${value}"]`,
        `.option:has-text("${value}")`,
      ];

      let clicked = false;
      for (const optSel of optionSelectors) {
        try {
          const option = session.page.locator(optSel).first();
          if ((await option.count()) > 0) {
            await option.click({ timeout: 3000 });
            clicked = true;
            break;
          }
        } catch {
          // Try next selector
        }
      }

      if (!clicked) {
        throw new ActionError(
          "select",
          `Could not find option "${value}" in custom dropdown`,
        );
      }
    }

    // Wait briefly for any side-effects (navigation, re-render)
    await session.page
      .waitForLoadState("domcontentloaded", { timeout: 3000 })
      .catch(() => {});
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError("select", message);
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
