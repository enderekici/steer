/**
 * Tests for snapshot processing (src/processing/snapshot.ts).
 * Tests formatSnapshot (pure function) and takeSnapshot (with mocked page).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';
import type { PageSnapshot } from '../../src/browser/session.js';
import { formatSnapshot, takeSnapshot } from '../../src/processing/snapshot.js';

// ── formatSnapshot ──────────────────────────────────────────────────────────

describe('formatSnapshot', () => {
  it('should format a basic snapshot with refs', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Example',
      refs: [
        { ref: 'r1', role: 'button', name: 'Submit' },
        { ref: 'r2', role: 'textbox', name: 'Email', value: 'test@test.com' },
      ],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('Page: Example');
    expect(result).toContain('URL:  https://example.com');
    expect(result).toContain('[r1] button "Submit"');
    expect(result).toContain('[r2] textbox "Email" value="test@test.com"');
  });

  it('should show empty message when no refs', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Empty Page',
      refs: [],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('(no interactive elements found)');
  });

  it('should show checked state', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Test',
      refs: [
        { ref: 'r1', role: 'checkbox', name: 'Agree', checked: true },
        { ref: 'r2', role: 'checkbox', name: 'Other', checked: false },
      ],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('checked=true');
    expect(result).toContain('checked=false');
  });

  it('should show disabled state', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Test',
      refs: [{ ref: 'r1', role: 'button', name: 'Disabled', disabled: true }],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('(disabled)');
  });

  it('should show expanded state', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Test',
      refs: [{ ref: 'r1', role: 'button', name: 'Menu', expanded: true }],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('expanded=true');
  });

  it('should show options', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Test',
      refs: [
        {
          ref: 'r1',
          role: 'combobox',
          name: 'Size',
          options: ['Small', 'Medium', 'Large'],
        },
      ],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('options=["Small", "Medium", "Large"]');
  });

  it('should show description', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Test',
      refs: [
        {
          ref: 'r1',
          role: 'button',
          name: 'Delete',
          description: 'Permanently remove this item',
        },
      ],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('-- Permanently remove this item');
  });

  it('should handle element with no name', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Test',
      refs: [{ ref: 'r1', role: 'textbox', name: '', value: 'some text' }],
    };

    const result = formatSnapshot(snapshot);
    expect(result).toContain('[r1] textbox value="some text"');
  });
});

// ── takeSnapshot ────────────────────────────────────────────────────────────

describe('takeSnapshot', () => {
  function createMockPage(rawElements: any[] = []) {
    return {
      url: vi.fn().mockReturnValue('http://test.com'),
      title: vi.fn().mockResolvedValue('Test Page'),
      // First evaluate call is the __name shim (string), second is the snapshot
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(rawElements),
      $: vi.fn().mockResolvedValue({ mock: true }),
    } as any;
  }

  it('should capture a snapshot with no elements', async () => {
    const page = createMockPage([]);
    const { snapshot, refMap } = await takeSnapshot(page);

    expect(snapshot.url).toBe('http://test.com');
    expect(snapshot.title).toBe('Test Page');
    expect(snapshot.refs).toEqual([]);
    expect(refMap.size).toBe(0);
  });

  it('should capture elements and build refMap', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Click me',
        value: undefined,
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: undefined,
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot, refMap } = await takeSnapshot(page);

    expect(snapshot.refs).toHaveLength(1);
    expect(snapshot.refs[0].ref).toBe('r1');
    expect(snapshot.refs[0].role).toBe('button');
    expect(snapshot.refs[0].name).toBe('Click me');
    expect(refMap.size).toBe(1);
    expect(refMap.has('r1')).toBe(true);
  });

  it('should include value for normal verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'input',
        role: 'textbox',
        name: 'Email',
        value: 'test@test.com',
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: undefined,
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'normal' });

    expect(snapshot.refs[0].value).toBe('test@test.com');
  });

  it('should include disabled for normal verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Submit',
        value: undefined,
        disabled: true,
        checked: undefined,
        expanded: undefined,
        options: undefined,
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'normal' });

    expect(snapshot.refs[0].disabled).toBe(true);
  });

  it('should include checked for normal verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'input',
        role: 'checkbox',
        name: 'Agree',
        value: undefined,
        disabled: false,
        checked: true,
        expanded: undefined,
        options: undefined,
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'normal' });

    expect(snapshot.refs[0].checked).toBe(true);
  });

  it('should include expanded for normal verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Menu',
        value: undefined,
        disabled: false,
        checked: undefined,
        expanded: true,
        options: undefined,
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'normal' });

    expect(snapshot.refs[0].expanded).toBe(true);
  });

  it('should exclude value/disabled/checked/expanded for minimal verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'input',
        role: 'textbox',
        name: 'Email',
        value: 'test@test.com',
        disabled: true,
        checked: true,
        expanded: true,
        options: ['a', 'b'],
        description: 'desc',
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'minimal' });

    expect(snapshot.refs[0].value).toBeUndefined();
    expect(snapshot.refs[0].disabled).toBeUndefined();
    expect(snapshot.refs[0].checked).toBeUndefined();
    expect(snapshot.refs[0].expanded).toBeUndefined();
    expect(snapshot.refs[0].options).toBeUndefined();
    expect(snapshot.refs[0].description).toBeUndefined();
  });

  it('should include description for detailed verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Delete',
        value: undefined,
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: ['a'],
        description: 'Remove item',
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'detailed' });

    expect(snapshot.refs[0].description).toBe('Remove item');
    expect(snapshot.refs[0].options).toEqual(['a']);
  });

  it('should include options for normal verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'select',
        role: 'combobox',
        name: 'Country',
        value: 'US',
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: ['US', 'UK', 'CA'],
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'normal' });

    expect(snapshot.refs[0].options).toEqual(['US', 'UK', 'CA']);
  });

  it('should not include description for normal verbosity', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Delete',
        value: undefined,
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: undefined,
        description: 'Remove item',
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'normal' });

    expect(snapshot.refs[0].description).toBeUndefined();
  });

  it('should handle page.$ returning null for an element', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Ghost',
        value: undefined,
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: undefined,
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    page.$.mockResolvedValue(null);
    const { snapshot, refMap } = await takeSnapshot(page);

    expect(snapshot.refs).toHaveLength(1);
    expect(refMap.size).toBe(0);
  });

  it('should handle page.$ throwing an error', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Error',
        value: undefined,
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: undefined,
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    page.$.mockRejectedValue(new Error('page closed'));
    const { snapshot, refMap } = await takeSnapshot(page);

    expect(snapshot.refs).toHaveLength(1);
    expect(refMap.size).toBe(0);
  });

  it('should pass scope option to evaluate', async () => {
    const page = createMockPage([]);
    await takeSnapshot(page, { scope: '#main' });

    // calls[0] is the __name shim, calls[1] is the snapshot evaluate
    const evaluateArgs = page.evaluate.mock.calls[1][1];
    expect(evaluateArgs.scopeSelector).toBe('#main');
  });

  it('should pass maxRefs option to evaluate', async () => {
    const page = createMockPage([]);
    await takeSnapshot(page, { maxRefs: 5 });

    // calls[0] is the __name shim, calls[1] is the snapshot evaluate
    const evaluateArgs = page.evaluate.mock.calls[1][1];
    expect(evaluateArgs.maxRefsLimit).toBe(5);
  });

  it('should handle title() throwing an error', async () => {
    const page = createMockPage([]);
    page.title.mockRejectedValue(new Error('no title'));
    const { snapshot } = await takeSnapshot(page);

    expect(snapshot.title).toBe('');
  });

  it('should not include empty options arrays', async () => {
    const rawElements = [
      {
        refId: 'r1',
        tag: 'button',
        role: 'button',
        name: 'Btn',
        value: undefined,
        disabled: false,
        checked: undefined,
        expanded: undefined,
        options: [],
        description: undefined,
      },
    ];
    const page = createMockPage(rawElements);
    const { snapshot } = await takeSnapshot(page, { verbosity: 'normal' });

    expect(snapshot.refs[0].options).toBeUndefined();
  });
});
