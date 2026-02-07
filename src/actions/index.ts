import type { Session } from "../browser/session.js";
import type { ActionTarget, ActionResult } from "./types.js";
import { ActionError, ValidationError } from "../utils/errors.js";
import { executeClick } from "./click.js";
import { executeType } from "./type.js";
import { executeSelect } from "./select.js";
import { executeScroll } from "./scroll.js";
import { executeNavigate } from "./navigate.js";

export type { ActionTarget, ActionResult } from "./types.js";
export { executeClick } from "./click.js";
export { executeType } from "./type.js";
export { executeSelect } from "./select.js";
export { executeScroll } from "./scroll.js";
export { executeNavigate } from "./navigate.js";

type ScrollDirection = "up" | "down" | "left" | "right";

interface ActionParams {
  target?: ActionTarget;
  value?: string;
  url?: string;
  direction?: ScrollDirection;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

function requireTarget(params: ActionParams, actionName: string): ActionTarget {
  if (!params.target || (!params.target.ref && !params.target.selector)) {
    throw new ValidationError(
      `Action "${actionName}" requires a target with ref or selector`,
    );
  }
  return params.target;
}

/**
 * Dispatch an action by name with the given parameters.
 * This is the primary entry point for executing browser actions.
 */
export async function executeAction(
  session: Session,
  action: string,
  params: ActionParams,
): Promise<ActionResult> {
  switch (action) {
    case "click": {
      const target = requireTarget(params, "click");
      return executeClick(session, target);
    }

    case "type": {
      const target = requireTarget(params, "type");
      if (params.value === undefined || params.value === null) {
        throw new ValidationError('Action "type" requires a "value" parameter');
      }
      return executeType(session, target, params.value);
    }

    case "select": {
      const target = requireTarget(params, "select");
      if (params.value === undefined || params.value === null) {
        throw new ValidationError(
          'Action "select" requires a "value" parameter',
        );
      }
      return executeSelect(session, target, params.value);
    }

    case "scroll": {
      const direction = params.direction ?? "down";
      const validDirections: ScrollDirection[] = [
        "up",
        "down",
        "left",
        "right",
      ];
      if (!validDirections.includes(direction)) {
        throw new ValidationError(
          `Invalid scroll direction "${direction}". Must be one of: ${validDirections.join(", ")}`,
        );
      }
      return executeScroll(session, direction, params.target);
    }

    case "navigate": {
      if (!params.url) {
        throw new ValidationError(
          'Action "navigate" requires a "url" parameter',
        );
      }
      return executeNavigate(session, params.url, params.waitUntil);
    }

    default:
      throw new ActionError(action, `Unknown action "${action}"`);
  }
}
