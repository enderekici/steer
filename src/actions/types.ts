import type { PageSnapshot } from '../browser/session.js';

export interface ActionTarget {
  ref?: string; // Preferred: "r5" - looked up from session.refs map
  selector?: string; // Fallback CSS selector
}

export interface ActionResult {
  success: boolean;
  snapshot: PageSnapshot;
  url: string;
  error?: string;
}
