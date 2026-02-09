import { ValidationError } from './errors.js';

const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'file:', 'vbscript:'];
const SELECTOR_PATTERN = /^[a-zA-Z0-9\s\-_.*#:[\]()='"~^$|,>+@\\/.]+$/;

export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') {
    throw new ValidationError('URL must not be empty');
  }

  const lower = trimmed.toLowerCase();
  for (const protocol of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(protocol)) {
      throw new ValidationError(`Blocked URL protocol: ${protocol}`);
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError(`Invalid URL: ${trimmed}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError(`Only http and https URLs are allowed, got: ${parsed.protocol}`);
  }

  return parsed.href;
}

export function sanitizeSelector(selector: string): string {
  const trimmed = selector.trim();
  if (trimmed === '') {
    throw new ValidationError('CSS selector must not be empty');
  }

  if (!SELECTOR_PATTERN.test(trimmed)) {
    throw new ValidationError(`Invalid CSS selector: ${trimmed}`);
  }

  return trimmed;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}
