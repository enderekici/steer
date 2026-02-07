import type { Session } from "../browser/session.js";
import type { ActionResult } from "./types.js";
import { ActionError, DomainNotAllowedError } from "../utils/errors.js";
import { sanitizeUrl } from "../utils/sanitize.js";
import { config } from "../config.js";
import { takeSnapshot } from "../processing/snapshot.js";
import { logger } from "../utils/logger.js";

function isDomainAllowed(url: string): boolean {
  const allowedDomains = config.allowedDomains;
  if (allowedDomains.length === 0) {
    // Empty allowlist means all domains are permitted
    return true;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  return allowedDomains.some((domain) => {
    // Exact match or subdomain match (e.g. "example.com" allows "www.example.com")
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });
}

export async function executeNavigate(
  session: Session,
  url: string,
  waitUntil?: "load" | "domcontentloaded" | "networkidle",
): Promise<ActionResult> {
  // Sanitize and validate the URL
  const sanitized = sanitizeUrl(url);

  // Check domain allowlist
  if (!isDomainAllowed(sanitized)) {
    const hostname = new URL(sanitized).hostname;
    throw new DomainNotAllowedError(hostname);
  }

  try {
    logger.info(
      { sessionId: session.id, url: sanitized, waitUntil: waitUntil ?? "domcontentloaded" },
      "Navigating",
    );

    await session.page.goto(sanitized, {
      waitUntil: waitUntil ?? "domcontentloaded",
      timeout: 30000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ActionError("navigate", `Navigation to ${sanitized} failed: ${message}`);
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
