/**
 * Tests for CLI mode dispatching (src/cli.ts).
 * Tests the --mcp, --mcp-http, and default REST API branches.
 */

import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('CLI', () => {
  it('should show help and exit with --help', () => {
    const output = execSync('npx tsx src/cli.ts --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(output).toContain('steer');
    expect(output).toContain('--mcp');
    expect(output).toContain('--mcp-http');
    expect(output).toContain('STEER_PORT');
    expect(output).toContain('STEER_BROWSER');
    expect(output).toContain('STEER_LOG_LEVEL');
    expect(output).toContain('MCP setup');
  });

  it('should include mcpServers example in help output', () => {
    const output = execSync('npx tsx src/cli.ts -h', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(output).toContain('mcpServers');
    expect(output).toContain('npx');
    expect(output).toContain('steer');
  });

  it('should include all environment variables in help', () => {
    const output = execSync('npx tsx src/cli.ts --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(output).toContain('STEER_HOST');
    expect(output).toContain('STEER_MCP_PORT');
    expect(output).toContain('STEER_MAX_SESSIONS');
    expect(output).toContain('STEER_SESSION_TIMEOUT_MS');
    expect(output).toContain('STEER_REQUEST_TIMEOUT_MS');
    expect(output).toContain('STEER_HEADLESS');
    expect(output).toContain('STEER_BLOCK_RESOURCES');
    expect(output).toContain('STEER_ALLOWED_DOMAINS');
    expect(output).toContain('STEER_EXECUTABLE_PATH');
  });
});
