process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.ABBWAK_LOG_LEVEL = 'silent';

import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/utils/errors.js';
import { sanitizeSelector, sanitizeUrl, truncateText } from '../../src/utils/sanitize.js';

// ── sanitizeUrl ─────────────────────────────────────────────────────────────

describe('sanitizeUrl', () => {
  it('should accept a valid http URL', () => {
    const result = sanitizeUrl('http://example.com');
    expect(result).toBe('http://example.com/');
  });

  it('should accept a valid https URL', () => {
    const result = sanitizeUrl('https://example.com/path?q=1');
    expect(result).toBe('https://example.com/path?q=1');
  });

  it('should accept an https URL with port', () => {
    const result = sanitizeUrl('https://example.com:8080/api');
    expect(result).toBe('https://example.com:8080/api');
  });

  it('should trim whitespace from the URL', () => {
    const result = sanitizeUrl('  https://example.com  ');
    expect(result).toBe('https://example.com/');
  });

  it('should reject javascript: protocol', () => {
    expect(() => sanitizeUrl('javascript:alert(1)')).toThrow(ValidationError);
    expect(() => sanitizeUrl('javascript:alert(1)')).toThrow('Blocked URL protocol');
  });

  it('should reject JavaScript: protocol (case insensitive)', () => {
    expect(() => sanitizeUrl('JavaScript:alert(1)')).toThrow(ValidationError);
  });

  it('should reject data: protocol', () => {
    expect(() => sanitizeUrl('data:text/html,<h1>hi</h1>')).toThrow(ValidationError);
    expect(() => sanitizeUrl('data:text/html,<h1>hi</h1>')).toThrow('Blocked URL protocol');
  });

  it('should reject file: protocol', () => {
    expect(() => sanitizeUrl('file:///etc/passwd')).toThrow(ValidationError);
    expect(() => sanitizeUrl('file:///etc/passwd')).toThrow('Blocked URL protocol');
  });

  it('should reject vbscript: protocol', () => {
    expect(() => sanitizeUrl('vbscript:msgbox("hi")')).toThrow(ValidationError);
  });

  it('should reject an empty string', () => {
    expect(() => sanitizeUrl('')).toThrow(ValidationError);
    expect(() => sanitizeUrl('')).toThrow('URL must not be empty');
  });

  it('should reject a whitespace-only string', () => {
    expect(() => sanitizeUrl('   ')).toThrow(ValidationError);
    expect(() => sanitizeUrl('   ')).toThrow('URL must not be empty');
  });

  it('should reject an invalid URL that cannot be parsed', () => {
    expect(() => sanitizeUrl('not-a-url')).toThrow(ValidationError);
    expect(() => sanitizeUrl('not-a-url')).toThrow('Invalid URL');
  });

  it('should reject ftp: protocol (not http or https)', () => {
    expect(() => sanitizeUrl('ftp://example.com/file')).toThrow(ValidationError);
    expect(() => sanitizeUrl('ftp://example.com/file')).toThrow('Only http and https');
  });

  it('should return the normalized href from the URL constructor', () => {
    const result = sanitizeUrl('https://EXAMPLE.COM/Path');
    expect(result).toBe('https://example.com/Path');
  });
});

// ── sanitizeSelector ────────────────────────────────────────────────────────

describe('sanitizeSelector', () => {
  it('should accept a simple tag selector', () => {
    expect(sanitizeSelector('div')).toBe('div');
  });

  it('should accept a class selector', () => {
    expect(sanitizeSelector('.my-class')).toBe('.my-class');
  });

  it('should accept an ID selector', () => {
    expect(sanitizeSelector('#my-id')).toBe('#my-id');
  });

  it('should accept an attribute selector', () => {
    expect(sanitizeSelector('[data-id="123"]')).toBe('[data-id="123"]');
  });

  it('should accept a complex combined selector', () => {
    expect(sanitizeSelector('div.class > span#id')).toBe('div.class > span#id');
  });

  it('should accept a pseudo-class selector', () => {
    expect(sanitizeSelector('a:hover')).toBe('a:hover');
  });

  it('should trim whitespace', () => {
    expect(sanitizeSelector('  div  ')).toBe('div');
  });

  it('should reject an empty string', () => {
    expect(() => sanitizeSelector('')).toThrow(ValidationError);
    expect(() => sanitizeSelector('')).toThrow('CSS selector must not be empty');
  });

  it('should reject a whitespace-only string', () => {
    expect(() => sanitizeSelector('   ')).toThrow(ValidationError);
  });

  it('should reject a selector with curly braces', () => {
    expect(() => sanitizeSelector('div { color: red }')).toThrow(ValidationError);
    expect(() => sanitizeSelector('div { color: red }')).toThrow('Invalid CSS selector');
  });

  it('should reject a selector with semicolons', () => {
    expect(() => sanitizeSelector('div; drop table')).toThrow(ValidationError);
  });
});

// ── truncateText ────────────────────────────────────────────────────────────

describe('truncateText', () => {
  it('should return short text unchanged when under maxLength', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('should return text unchanged when exactly at maxLength', () => {
    expect(truncateText('hello', 5)).toBe('hello');
  });

  it('should truncate long text and append ellipsis', () => {
    const result = truncateText('hello world', 8);
    // maxLength 8 -> slice(0, 5) + "..." = "hello..."
    expect(result).toBe('hello...');
    expect(result.length).toBe(8);
  });

  it('should truncate a very long string to exactly maxLength characters', () => {
    const longText = 'a'.repeat(1000);
    const result = truncateText(longText, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should handle maxLength of 3 (minimum for ellipsis)', () => {
    const result = truncateText('abcdef', 3);
    expect(result).toBe('...');
  });

  it('should handle empty text', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('should handle single character text under maxLength', () => {
    expect(truncateText('a', 10)).toBe('a');
  });
});
