/**
 * Tests for CLI argument parsing and help output.
 */

import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('CLI', () => {
  it('should show help with --help flag', () => {
    const output = execSync('npx tsx src/cli.ts --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(output).toContain('steer');
    expect(output).toContain('--mcp');
    expect(output).toContain('STEER_PORT');
    expect(output).toContain('STEER_SESSION_TIMEOUT_MS');
    expect(output).toContain('STEER_REQUEST_TIMEOUT_MS');
    expect(output).toContain('STEER_EXECUTABLE_PATH');
  });

  it('should show help with -h flag', () => {
    const output = execSync('npx tsx src/cli.ts -h', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(output).toContain('steer');
    expect(output).toContain('mcpServers');
  });
});
