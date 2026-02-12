/**
 * Tests for MCP tool definitions (src/mcp/tools.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../src/mcp/tools.js';

describe('TOOLS', () => {
  it('should export an array of tool definitions', () => {
    expect(Array.isArray(TOOLS)).toBe(true);
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it('should have 5 tools defined', () => {
    expect(TOOLS.length).toBe(5);
  });

  it('should have browser_navigate tool', () => {
    const tool = TOOLS.find((t) => t.name === 'browser_navigate');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('Navigate');
    expect(tool?.inputSchema.properties.url).toBeDefined();
    expect(tool?.inputSchema.required).toContain('url');
  });

  it('should have browser_act tool', () => {
    const tool = TOOLS.find((t) => t.name === 'browser_act');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('action');
    expect(tool?.inputSchema.properties.action).toBeDefined();
    expect(tool?.inputSchema.required).toContain('action');
  });

  it('should have browser_extract tool', () => {
    const tool = TOOLS.find((t) => t.name === 'browser_extract');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('Extract');
  });

  it('should have browser_observe tool', () => {
    const tool = TOOLS.find((t) => t.name === 'browser_observe');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('accessibility snapshot');
  });

  it('should have browser_screenshot tool', () => {
    const tool = TOOLS.find((t) => t.name === 'browser_screenshot');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('screenshot');
  });

  it('should have valid action enum in browser_act', () => {
    const tool = TOOLS.find((t) => t.name === 'browser_act');
    const actionEnum = (tool?.inputSchema.properties.action as any).enum;
    expect(actionEnum).toContain('click');
    expect(actionEnum).toContain('type');
    expect(actionEnum).toContain('select');
    expect(actionEnum).toContain('scroll');
    expect(actionEnum).toContain('wait');
    expect(actionEnum).toContain('keyboard');
    expect(actionEnum).toContain('hover');
    expect(actionEnum).toContain('upload');
    expect(actionEnum).toContain('dialog');
  });

  it('should have all tools with inputSchema type object', () => {
    for (const tool of TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('should have sessionId as optional on all tools', () => {
    for (const tool of TOOLS) {
      expect(tool.inputSchema.properties.sessionId).toBeDefined();
      expect(tool.inputSchema.properties.sessionId.type).toBe('string');
      // sessionId should not be in required
      if ('required' in tool.inputSchema) {
        expect((tool.inputSchema as any).required).not.toContain('sessionId');
      }
    }
  });
});
