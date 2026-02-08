import type { Dialog } from 'playwright';
import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import type { ActionResult } from './types.js';

export interface DialogConfig {
  action: 'accept' | 'dismiss';
  promptText?: string;
}

/**
 * Install a dialog handler on the session page.
 * Dialogs (alert, confirm, prompt, beforeunload) are auto-handled
 * based on the session's current dialog config.
 */
export function installDialogHandler(
  session: Session,
  config: DialogConfig = { action: 'accept' },
): void {
  // Store config on session for later reference
  (session as SessionWithDialog).dialogConfig = config;

  // Remove any existing handler first
  session.page.removeAllListeners('dialog');

  session.page.on('dialog', async (dialog: Dialog) => {
    const cfg = (session as SessionWithDialog).dialogConfig ?? { action: 'accept' };

    if (cfg.action === 'accept') {
      await dialog.accept(cfg.promptText);
    } else {
      await dialog.dismiss();
    }
  });
}

interface SessionWithDialog extends Session {
  dialogConfig?: DialogConfig;
}

/**
 * Configure how the next dialog will be handled, and return current page state.
 */
export async function executeDialogConfig(
  session: Session,
  config: DialogConfig,
): Promise<ActionResult> {
  installDialogHandler(session, config);

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
