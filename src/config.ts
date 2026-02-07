type BrowserType = "chromium" | "firefox" | "webkit";

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function envList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function envBrowser(key: string, fallback: BrowserType): BrowserType {
  const raw = process.env[key];
  if (raw === "chromium" || raw === "firefox" || raw === "webkit") return raw;
  return fallback;
}

export const config = {
  port: envInt("ABBWAK_PORT", 3000),
  host: env("ABBWAK_HOST", "0.0.0.0"),
  maxSessions: envInt("ABBWAK_MAX_SESSIONS", 10),
  sessionTimeoutMs: envInt("ABBWAK_SESSION_TIMEOUT_MS", 300_000),
  requestTimeoutMs: envInt("ABBWAK_REQUEST_TIMEOUT_MS", 30_000),
  allowedDomains: envList("ABBWAK_ALLOWED_DOMAINS", []),
  headless: envBool("ABBWAK_HEADLESS", true),
  blockResources: envList("ABBWAK_BLOCK_RESOURCES", [
    "image",
    "font",
    "media",
  ]),
  browser: envBrowser("ABBWAK_BROWSER", "chromium"),
  viewportWidth: envInt("ABBWAK_VIEWPORT_WIDTH", 1280),
  viewportHeight: envInt("ABBWAK_VIEWPORT_HEIGHT", 720),
} as const;

export type Config = typeof config;
