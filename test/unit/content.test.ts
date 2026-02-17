/**
 * Tests for content extraction (src/processing/content.ts).
 * Uses mocked page objects to test text, markdown, and structured extraction.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';
import { extractContent } from '../../src/processing/content.js';
import { ValidationError } from '../../src/utils/errors.js';

function createMockPage(
  options: {
    content?: string;
    title?: string;
    innerText?: string;
    url?: string;
    evalResult?: any;
    evalThrows?: boolean;
  } = {},
) {
  const {
    content = '<html><body><p>Hello World</p></body></html>',
    title = 'Test Page',
    innerText = 'Hello World',
    url = 'http://test.com',
    evalResult = null,
    evalThrows = false,
  } = options;

  return {
    url: vi.fn().mockReturnValue(url),
    title: vi.fn().mockResolvedValue(title),
    content: vi.fn().mockResolvedValue(content),
    $eval: vi.fn().mockImplementation((_selector: string, _fn: (...args: never) => unknown) => {
      if (evalThrows) throw new Error('eval failed');
      if (evalResult !== null) return Promise.resolve(evalResult);
      return Promise.resolve(content);
    }),
    $$eval: vi.fn().mockResolvedValue([]),
    innerText: vi.fn().mockResolvedValue(innerText),
  } as any;
}

describe('extractContent', () => {
  // ── Text mode ──
  describe('text mode', () => {
    it('should extract text content from page', async () => {
      const page = createMockPage({
        content:
          '<html><body><article><h1>Title</h1><p>Some text content here.</p></article></body></html>',
      });

      const result = await extractContent(page, { mode: 'text' });

      expect(result.url).toBe('http://test.com');
      expect(result.title).toBeTruthy();
      expect(typeof result.content).toBe('string');
    });

    it('should extract text with selector', async () => {
      const page = createMockPage({
        evalResult: '<p>Scoped content</p>',
      });

      const result = await extractContent(page, { mode: 'text', selector: '#main' });
      expect(typeof result.content).toBe('string');
    });

    it('should return empty string when selector returns null', async () => {
      const page = createMockPage();
      page.$eval.mockRejectedValue(new Error('not found'));
      // The first $eval for html returns null via catch
      // Then it tries innerText via $eval

      const result = await extractContent(page, { mode: 'text', selector: '.missing' });
      expect(typeof result.content).toBe('string');
    });

    it('should respect maxLength', async () => {
      const longText = 'a'.repeat(10000);
      const page = createMockPage({
        content: `<html><body><article><p>${longText}</p></article></body></html>`,
      });

      const result = await extractContent(page, { mode: 'text', maxLength: 100 });
      expect((result.content as string).length).toBeLessThanOrEqual(100);
    });

    it('should use default maxLength of 4000', async () => {
      const longText = 'a'.repeat(10000);
      const page = createMockPage({
        content: `<html><body><article><p>${longText}</p></article></body></html>`,
      });

      const result = await extractContent(page, { mode: 'text' });
      expect((result.content as string).length).toBeLessThanOrEqual(4000);
    });

    it('should fall back to innerText when Readability fails', async () => {
      // Content that Readability cannot parse as an article
      const page = createMockPage({
        content: '<div></div>',
        innerText: 'Fallback text',
      });

      const result = await extractContent(page, { mode: 'text' });
      expect(typeof result.content).toBe('string');
    });

    it('should handle innerText failure gracefully', async () => {
      const page = createMockPage({
        content: '<div></div>',
      });
      page.innerText.mockRejectedValue(new Error('no body'));

      const result = await extractContent(page, { mode: 'text' });
      expect(typeof result.content).toBe('string');
    });
  });

  // ── Markdown mode ──
  describe('markdown mode', () => {
    it('should extract markdown from page', async () => {
      const page = createMockPage({
        content: '<h1>Title</h1><p>Paragraph text</p>',
      });
      page.$eval.mockResolvedValue('<h1>Title</h1><p>Paragraph text</p>');

      const result = await extractContent(page, { mode: 'markdown' });
      expect(typeof result.content).toBe('string');
      expect(result.url).toBe('http://test.com');
    });

    it('should extract markdown with selector', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue('<p>Scoped markdown content</p>');

      const result = await extractContent(page, { mode: 'markdown', selector: '#main' });
      expect(typeof result.content).toBe('string');
    });

    it('should return empty content when html is empty', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue('');

      const result = await extractContent(page, { mode: 'markdown' });
      expect(result.content).toBe('');
    });

    it('should return empty content when $eval throws', async () => {
      const page = createMockPage();
      page.$eval.mockRejectedValue(new Error('fail'));

      const result = await extractContent(page, { mode: 'markdown' });
      expect(result.content).toBe('');
    });

    it('should strip noisy tags (script, style, nav, etc)', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue(
        '<nav>Nav</nav><script>alert(1)</script><style>.x{}</style><p>Content</p><footer>Foot</footer>',
      );

      const result = await extractContent(page, { mode: 'markdown' });
      const content = result.content as string;
      expect(content).not.toContain('Nav');
      expect(content).not.toContain('alert');
      expect(content).not.toContain('Foot');
      expect(content).toContain('Content');
    });

    it('should respect maxLength for markdown', async () => {
      const longHtml = `<p>${'a'.repeat(10000)}</p>`;
      const page = createMockPage();
      page.$eval.mockResolvedValue(longHtml);

      const result = await extractContent(page, { mode: 'markdown', maxLength: 50 });
      expect((result.content as string).length).toBeLessThanOrEqual(50);
    });
  });

  // ── Structured mode ──
  describe('structured mode', () => {
    it('should throw ValidationError when schema is missing', async () => {
      const page = createMockPage();

      await expect(extractContent(page, { mode: 'structured' })).rejects.toThrow(ValidationError);
      await expect(extractContent(page, { mode: 'structured' })).rejects.toThrow(
        'requires a schema',
      );
    });

    it('should throw ValidationError for array schema without selector', async () => {
      const page = createMockPage();

      await expect(
        extractContent(page, {
          mode: 'structured',
          schema: { type: 'array', items: { type: 'object', properties: {} } },
        }),
      ).rejects.toThrow(ValidationError);
      await expect(
        extractContent(page, {
          mode: 'structured',
          schema: { type: 'array', items: { type: 'object', properties: {} } },
        }),
      ).rejects.toThrow('requires a selector');
    });

    it('should throw ValidationError for array schema without items.properties', async () => {
      const page = createMockPage();

      await expect(
        extractContent(page, {
          mode: 'structured',
          selector: '.item',
          schema: { type: 'array' },
        }),
      ).rejects.toThrow(ValidationError);
      await expect(
        extractContent(page, {
          mode: 'structured',
          selector: '.item',
          schema: { type: 'array' },
        }),
      ).rejects.toThrow('must define items with properties');
    });

    it('should extract array of structured data', async () => {
      const page = createMockPage();
      page.$$eval.mockResolvedValue([
        { name: 'Item 1', price: 10 },
        { name: 'Item 2', price: 20 },
      ]);

      const result = await extractContent(page, {
        mode: 'structured',
        selector: '.item',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              price: { type: 'number' },
            },
          },
        },
      });

      expect(Array.isArray(result.content)).toBe(true);
      expect((result.content as any[]).length).toBe(2);
    });

    it('should extract object structured data', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue({ title: 'Product', price: 29.99 });

      const result = await extractContent(page, {
        mode: 'structured',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            price: { type: 'number' },
          },
        },
      });

      expect(typeof result.content).toBe('object');
      expect(Array.isArray(result.content)).toBe(false);
    });

    it('should extract object data with selector', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue({ title: 'Scoped' });

      const result = await extractContent(page, {
        mode: 'structured',
        selector: '#product',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
        },
      });

      expect(typeof result.content).toBe('object');
    });

    it('should throw ValidationError for unsupported schema type', async () => {
      const page = createMockPage();

      await expect(
        extractContent(page, {
          mode: 'structured',
          schema: { type: 'string' },
        }),
      ).rejects.toThrow(ValidationError);
      await expect(
        extractContent(page, {
          mode: 'structured',
          schema: { type: 'string' },
        }),
      ).rejects.toThrow('Unsupported schema type');
    });

    it('should throw ValidationError for object schema without properties', async () => {
      const page = createMockPage();

      // Object schema with no properties -> falls through to the error
      await expect(
        extractContent(page, {
          mode: 'structured',
          schema: { type: 'object' },
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should trim array result if serialized exceeds maxLength', async () => {
      const largeItems = Array.from({ length: 100 }, (_, i) => ({
        name: `Item ${i}`,
        description: 'x'.repeat(100),
      }));

      const page = createMockPage();
      page.$$eval.mockResolvedValue(largeItems);

      const result = await extractContent(page, {
        mode: 'structured',
        selector: '.item',
        maxLength: 200,
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      });

      const serialized = JSON.stringify(result.content);
      expect(serialized.length).toBeLessThanOrEqual(200);
    });
  });

  // ── Unknown mode ──
  describe('unknown mode', () => {
    it('should throw ValidationError for unknown mode', async () => {
      const page = createMockPage();

      await expect(extractContent(page, { mode: 'xml' as any })).rejects.toThrow(ValidationError);
      await expect(extractContent(page, { mode: 'xml' as any })).rejects.toThrow(
        'Unknown extraction mode',
      );
    });
  });
});
