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
    expect(output).toContain('abbwak');
    expect(output).toContain('--mcp');
    expect(output).toContain('ABBWAK_PORT');
    expect(output).toContain('ABBWAK_SESSION_TIMEOUT_MS');
    expect(output).toContain('ABBWAK_REQUEST_TIMEOUT_MS');
    expect(output).toContain('ABBWAK_EXECUTABLE_PATH');
  });

  it('should show help with -h flag', () => {
    const output = execSync('npx tsx src/cli.ts -h', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(output).toContain('abbwak');
    expect(output).toContain('mcpServers');
  });
});
