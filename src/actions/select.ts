import type { ElementHandle } from "playwright";
import type { Session } from "../browser/session.js";
import type { ActionTarget, ActionResult } from "./types.js";
import { ActionError } from "../utils/errors.js";
import { sanitizeSelector } from "../utils/sanitize.js";
import { takeSnapshot } from "../processing/snapshot.js";
import { resolveElement } from "./resolve.js";
import { logger } from "../utils/logger.js";

async function isNativeSelect(element: ElementHandle): Promise<boolean> {
  return element.evaluate(
    (el) => (el as unknown as Element).tagName.toLowerCase() === "select",
  );
}

async function getEffectiveSelector(
  target: ActionTarget,
  element: ElementHandle,
): Promise<string> {
  if (target.selector) {
    return sanitizeSelector(target.selector);
  }

  const generated: string = await element.evaluate((node) => {
    const el = node as unknown as Element;
    if (el.id) return `#${el.id}`;
    if (el.getAttribute("name")) {
      return `${el.tagName.toLowerCase()}[name="${el.getAttribute("name")}"]`;
    }
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
  const element = await resolveElement(session, target, "select");

  try {
    const isNative = await isNativeSelect(element);

    if (isNative) {
      const selector = await getEffectiveSelector(target, element);
      await session.page.selectOption(selector, value);
    } else {
      logger.info(
        { sessionId: session.id, value },
        "Handling custom dropdown select",
      );

      await element.scrollIntoViewIfNeeded().catch(() => {});
      await element.click({ timeout: 5000 });
      await session.page.waitForTimeout(300);

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

    await session.page
      .waitForLoadState("domcontentloaded", { timeout: 3000 })
      .catch(() => {});
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError("select", message);
  }

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
