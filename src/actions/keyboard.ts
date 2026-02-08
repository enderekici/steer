import type { Session } from '../browser/session.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { ActionError } from '../utils/errors.js';
import type { ActionResult } from './types.js';

const ALLOWED_KEYS = new Set([
  'Enter',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  ' ',
  'Space',
]);

const MODIFIER_PATTERN = /^(Control|Alt|Shift|Meta)\+\w+$/;

export async function executeKeyboard(session: Session, key: string): Promise<ActionResult> {
  // Validate the key to prevent injection of arbitrary sequences
  const isAllowed =
    ALLOWED_KEYS.has(key) ||
    MODIFIER_PATTERN.test(key) ||
    (key.length === 1 && key >= ' ' && key <= '~'); // printable ASCII

  if (!isAllowed) {
    throw new ActionError('keyboard', `Invalid key: "${key}"`);
  }

  try {
    await session.page.keyboard.press(key);

    await session.page.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {});
  } catch (err) {
    if (err instanceof ActionError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError('keyboard', message);
  }

  const { snapshot, refMap } = await takeSnapshot(session.page);

  session.refs.clear();
  for (const [key, handle] of refMap) {
    session.refs.set(key, handle);
  }

  session.touch();

  return { success: true, snapshot, url: session.page.url() };
}
