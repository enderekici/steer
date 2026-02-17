/**
 * Tests for content.ts helper functions.
 * Tests stripTags, collapseWhitespace, truncate, trimArray, pageTitle.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';
import { extractContent } from '../../src/processing/content.js';

function createMockPage(opts: Record<string, any> = {}) {
  return {
    url: vi.fn().mockReturnValue(opts.url ?? 'http://test.com'),
    title: opts.titleRejects
      ? vi.fn().mockRejectedValue(new Error('no title'))
      : vi.fn().mockResolvedValue(opts.title ?? 'Test'),
    content: vi.fn().mockResolvedValue(opts.content ?? '<body></body>'),
    $eval: vi.fn().mockImplementation(async (_sel: string, _fn: (...args: never) => unknown) => {
      if (opts.evalReturn !== undefined) return opts.evalReturn;
      return opts.content ?? '<body></body>';
    }),
    $$eval: vi.fn().mockResolvedValue(opts.evalListReturn ?? []),
    innerText: vi.fn().mockResolvedValue(opts.innerText ?? ''),
  } as any;
}

describe('content helpers via extractContent', () => {
  describe('text mode - various fallback paths', () => {
    it('should handle page with empty content', async () => {
      const page = createMockPage({ content: '' });
      // When content is empty, readability returns empty, falls back to innerText
      page.$eval.mockRejectedValue(new Error('fail'));

      const result = await extractContent(page, { mode: 'text' });
      expect(typeof result.content).toBe('string');
    });

    it('should handle title error with empty fallback in text mode', async () => {
      const page = createMockPage({
        content: '<article><h1>Title</h1><p>Content</p></article>',
        titleRejects: true,
      });

      const result = await extractContent(page, { mode: 'text' });
      expect(result.title).toBe('');
    });

    it('should handle title error in markdown mode', async () => {
      const page = createMockPage({
        titleRejects: true,
      });
      page.$eval.mockResolvedValue('<p>test</p>');

      const result = await extractContent(page, { mode: 'markdown' });
      expect(result.title).toBe('');
    });

    it('should fallback to innerText with selector when readability fails', async () => {
      const page = createMockPage({
        innerText: 'Fallback text from innerText',
      });
      page.$eval.mockImplementation(async (_sel: string, _fn: (...args: never) => unknown) => {
        // First call returns html (which readability can't parse)
        // Second call returns innerText
        return '<div></div>';
      });

      const result = await extractContent(page, { mode: 'text', selector: '#main' });
      expect(typeof result.content).toBe('string');
    });

    it('should handle innerText error with selector', async () => {
      const page = createMockPage();
      // First $eval for html
      let callCount = 0;
      page.$eval.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return '<div></div>';
        throw new Error('fail');
      });

      const result = await extractContent(page, { mode: 'text', selector: '#main' });
      expect(typeof result.content).toBe('string');
    });
  });

  describe('markdown mode', () => {
    it('should strip header, aside, and self-closing tags', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue('<header>Header</header><aside>Sidebar</aside><p>Content</p>');

      const result = await extractContent(page, { mode: 'markdown' });
      const content = result.content as string;
      expect(content).not.toContain('Header');
      expect(content).not.toContain('Sidebar');
      expect(content).toContain('Content');
    });

    it('should collapse excessive whitespace', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue('<p>Line 1</p>\n\n\n\n\n<p>Line 2</p>');

      const result = await extractContent(page, { mode: 'markdown' });
      const content = result.content as string;
      // Should not have more than 2 consecutive newlines
      expect(content).not.toMatch(/\n{3,}/);
    });
  });

  describe('structured mode - object extraction', () => {
    it('should extract object from body when no selector', async () => {
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
    });

    it('should extract object with selector', async () => {
      const page = createMockPage();
      page.$eval.mockResolvedValue({ name: 'Test' });

      const result = await extractContent(page, {
        mode: 'structured',
        selector: '#product',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      });

      expect(typeof result.content).toBe('object');
    });
  });

  describe('structured mode - array extraction', () => {
    it('should extract items with trimming when too large', async () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        name: `Item ${i} with a ${'x'.repeat(50)} long description`,
      }));
      const page = createMockPage({ evalListReturn: items });
      page.$$eval.mockResolvedValue(items);

      const result = await extractContent(page, {
        mode: 'structured',
        selector: '.item',
        maxLength: 100,
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      });

      const serialized = JSON.stringify(result.content);
      // The trimArray function should have trimmed it
      expect(serialized.length).toBeLessThanOrEqual(100);
    });

    it('should return all items when within maxLength', async () => {
      const items = [{ name: 'A' }, { name: 'B' }];
      const page = createMockPage();
      page.$$eval.mockResolvedValue(items);

      const result = await extractContent(page, {
        mode: 'structured',
        selector: '.item',
        maxLength: 10000,
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      });

      expect((result.content as any[]).length).toBe(2);
    });
  });
});
