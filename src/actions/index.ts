import type { Session } from '../browser/session.js';
import { ActionError, ValidationError } from '../utils/errors.js';
import { executeClick } from './click.js';
import { executeDialogConfig } from './dialog.js';
import { executeHover } from './hover.js';
import { executeKeyboard } from './keyboard.js';
import { executeNavigate } from './navigate.js';
import { executeScroll } from './scroll.js';
import { executeSelect } from './select.js';
import { executeType } from './type.js';
import type { ActionResult, ActionTarget } from './types.js';
import { executeUpload } from './upload.js';
import { executeWait } from './wait.js';

export type { ActionTarget, ActionResult } from './types.js';
export { executeClick } from './click.js';
export { executeType } from './type.js';
export { executeSelect } from './select.js';
export { executeScroll } from './scroll.js';
export { executeNavigate } from './navigate.js';
export { executeWait } from './wait.js';
export { executeKeyboard } from './keyboard.js';
export { executeHover } from './hover.js';
export { executeUpload } from './upload.js';
export { executeDialogConfig } from './dialog.js';
export { installDialogHandler } from './dialog.js';

type ScrollDirection = 'up' | 'down' | 'left' | 'right';

interface ActionParams {
  target?: ActionTarget;
  value?: string;
  url?: string;
  direction?: ScrollDirection;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  selector?: string;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
  timeout?: number;
  key?: string;
  filePaths?: string[];
  dialogAction?: 'accept' | 'dismiss';
  promptText?: string;
}

function requireTarget(params: ActionParams, actionName: string): ActionTarget {
  if (!params.target || (!params.target.ref && !params.target.selector)) {
    throw new ValidationError(`Action "${actionName}" requires a target with ref or selector`);
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
    case 'click': {
      const target = requireTarget(params, 'click');
      return executeClick(session, target);
    }

    case 'type': {
      const target = requireTarget(params, 'type');
      if (params.value === undefined || params.value === null) {
        throw new ValidationError('Action "type" requires a "value" parameter');
      }
      return executeType(session, target, params.value);
    }

    case 'select': {
      const target = requireTarget(params, 'select');
      if (params.value === undefined || params.value === null) {
        throw new ValidationError('Action "select" requires a "value" parameter');
      }
      return executeSelect(session, target, params.value);
    }

    case 'scroll': {
      const direction = params.direction ?? 'down';
      const validDirections: ScrollDirection[] = ['up', 'down', 'left', 'right'];
      if (!validDirections.includes(direction)) {
        throw new ValidationError(
          `Invalid scroll direction "${direction}". Must be one of: ${validDirections.join(', ')}`,
        );
      }
      return executeScroll(session, direction, params.target);
    }

    case 'navigate': {
      if (!params.url) {
        throw new ValidationError('Action "navigate" requires a "url" parameter');
      }
      return executeNavigate(session, params.url, params.waitUntil);
    }

    case 'wait': {
      return executeWait(session, {
        selector: params.selector,
        state: params.state,
        timeout: params.timeout,
      });
    }

    case 'keyboard': {
      if (!params.key) {
        throw new ValidationError('Action "keyboard" requires a "key" parameter');
      }
      return executeKeyboard(session, params.key);
    }

    case 'hover': {
      const target = requireTarget(params, 'hover');
      return executeHover(session, target);
    }

    case 'upload': {
      const target = requireTarget(params, 'upload');
      if (!params.filePaths || params.filePaths.length === 0) {
        throw new ValidationError(
          'Action "upload" requires a "filePaths" parameter with at least one path',
        );
      }
      return executeUpload(session, target, params.filePaths);
    }

    case 'dialog': {
      const dialogAction = params.dialogAction ?? 'accept';
      return executeDialogConfig(session, {
        action: dialogAction,
        promptText: params.promptText,
      });
    }

    default:
      throw new ActionError(action, `Unknown action "${action}"`);
  }
}
