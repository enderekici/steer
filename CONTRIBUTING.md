# Contributing to steer

Thank you for your interest in contributing to steer. This guide covers everything you need to get started.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Running Tests](#running-tests)
- [Adding a New Action](#adding-a-new-action)
- [Known Pitfalls](#known-pitfalls)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

---

## Development Setup

### Prerequisites

- **Node.js 24+** (check with `node --version`)
- **npm** (ships with Node.js)
- A supported browser engine installed via Playwright

### Getting Started

```bash
# Clone the repository
git clone https://github.com/enderekici/steer.git
cd steer

# Install dependencies
npm install

# Install the default browser (Firefox)
npx playwright install firefox

# Start the REST API server in development mode
npm run dev

# Or start the MCP server in development mode
npm run mcp:dev
```

The REST API server starts at `http://localhost:3000` by default. The MCP server uses stdio transport for direct integration with Claude Desktop and similar tools.

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start REST API with hot reload (tsx) |
| `npm run mcp:dev` | Start MCP server with hot reload (tsx) |
| `npm run build` | Compile to `dist/` (tsup, ESM + DTS) |
| `npm start` | Start REST API from compiled output |
| `npm run mcp` | Start MCP server from compiled output |
| `npm test` | Run all tests (vitest) |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | Run Biome linter |
| `npm run lint:fix` | Auto-fix lint issues |

### Environment Variables

steer is configured entirely via environment variables prefixed with `STEER_`. The most relevant ones for development:

| Variable | Default | Description |
|----------|---------|-------------|
| `STEER_PORT` | `3000` | REST API server port |
| `STEER_HEADLESS` | `true` | Set to `false` to see the browser window |
| `STEER_BROWSER` | `firefox` | Browser engine: `chromium`, `firefox`, `webkit` |
| `STEER_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `STEER_MAX_SESSIONS` | `10` | Maximum concurrent browser sessions |

See the full list in [README.md](README.md#configuration).

---

## Code Style

steer uses [Biome](https://biomejs.dev/) for linting and formatting. The configuration lives in `biome.json`.

### Rules

- **Indentation:** 2 spaces (no tabs)
- **Quotes:** Single quotes (configured in Biome; follow the convention used in the file you are editing)
- **Semicolons:** Always required
- **Line width:** 100 characters
- **Trailing commas:** Always (in arrays, objects, function parameters)
- **Imports:** Auto-organized by Biome (run `npm run lint:fix` to sort)
- **Unused imports:** Warned by the linter
- **`var` keyword:** Forbidden; use `const` or `let`
- **`any` type:** Warned in source code, allowed in test files

### Formatting Workflow

Before committing, run:

```bash
npm run lint:fix    # Auto-fix formatting and import order
npm run typecheck   # Ensure no type errors
```

If you use an editor with Biome support (VS Code, Zed, etc.), enable format-on-save with the project's `biome.json` configuration.

---

## Running Tests

steer uses [vitest](https://vitest.dev/) as its test framework. Tests are split into two categories.

### Unit Tests

Unit tests do not require a browser and run quickly. They cover configuration parsing, error classes, input sanitization, retry logic, and CLI output.

```bash
npm test -- test/unit/
```

There are currently 72 unit tests.

### Integration Tests

Integration tests launch a real browser and test the full request lifecycle: session management, navigation, actions, extraction, and screenshots. They serve local HTML fixtures via a Node HTTP server on a random port.

```bash
# Install the browser first
npx playwright install firefox

# Run integration tests
npm test -- test/integration/
```

### Skipping Heavy Browser Tests

Some browser action tests (click, type) are resource-intensive and may fail in memory-constrained environments such as CI containers. To skip them:

```bash
SKIP_HEAVY_BROWSER_TESTS=1 npm test
```

### Running All Tests

```bash
npm test
```

### Test Configuration

The vitest configuration in `vitest.config.ts` sets:

- `testTimeout: 30000` (30 seconds per test)
- `hookTimeout: 30000` (30 seconds for `beforeAll`/`afterAll`)
- `fileParallelism: false` (tests run sequentially because the browser instance is shared)
- Coverage provider: v8

### Test Fixtures

Test fixtures are plain HTML files in `test/fixtures/`:

| Fixture | Purpose |
|---------|---------|
| `login-form.html` | Click, type, select, checkbox interactions |
| `table-data.html` | Structured data extraction |
| `search-results.html` | Text and markdown extraction |
| `complex-spa.html` | Scroll, wait, dynamic content |

### Tips

- If tests fail with browser crashes, try setting `STEER_BROWSER=firefox` (Firefox uses less memory than Chromium).
- Use `STEER_EXECUTABLE_PATH` if your browser binary is in a non-standard location.
- Integration tests require network access to start the local fixture server, but do not make external HTTP requests.

---

## Adding a New Action

steer has a well-defined pattern for adding browser actions. Follow these six steps.

### Step 1: Create the Action Module

Create `src/actions/myaction.ts` following this pattern:

```typescript
import type { Session } from '../browser/session.js';
import type { ActionTarget, ActionResult } from './types.js';
import { ActionError } from '../utils/errors.js';
import { takeSnapshot } from '../processing/snapshot.js';
import { resolveElement } from './resolve.js';

export const executeMyAction = async (
  session: Session,
  target: ActionTarget,
  /* any additional parameters */
): Promise<ActionResult> => {
  // 1. Resolve the target element (if ref/selector based)
  const element = await resolveElement(session, target, 'myaction');

  // 2. Perform the action
  // ... your action logic here ...

  // 3. Take a fresh snapshot
  const { snapshot, refMap } = await takeSnapshot(session.page);

  // 4. Update session refs
  session.refs.clear();
  for (const [key, value] of refMap) {
    session.refs.set(key, value);
  }

  // 5. Touch the session (resets idle timeout)
  session.touch();

  // 6. Return the standard result shape
  return { success: true, snapshot, url: session.page.url() };
};
```

Key points:
- Use `resolveElement()` from `resolve.ts` for element lookup. It handles ref resolution, selector fallback, stale detection, and clear error messages.
- Use `withRetry(fn, { retries: 1, actionName })` for actions that may fail transiently.
- Throw `ActionError('myaction', message)` for action failures.
- Throw `ValidationError(message)` for invalid input.
- Always take a fresh snapshot and update `session.refs` after the action completes.

### Step 2: Register in the Action Dispatcher

Edit `src/actions/index.ts`:

1. Add the import and re-export for your action module.
2. Add a `case` to the `executeAction()` switch statement.
3. Add any new parameters to the `ActionParams` interface.

### Step 3: Update the REST API Route

Edit `src/server/routes/act.ts`:

1. Add the new action name to the `ActBody` interface.
2. Add it to the JSON schema `enum` for the `action` field.
3. Add any new body properties to the request schema.
4. Pass the new parameters in the route handler.

### Step 4: Update MCP Tool Definitions

Edit `src/mcp/tools.ts`:

1. Add the action name to the `browser_act` tool's `action` enum.
2. Add descriptions for any new parameters.

### Step 5: Update the MCP Server Handler

Edit `src/mcp/server.ts`:

1. Pass the new parameters in the `handleAct()` function's call to `executeAction()`.

### Step 6: Add Tests

Add integration tests in `test/integration/actions.test.ts`:

- Create or reuse an HTML fixture in `test/fixtures/`.
- Test the happy path.
- Test error cases (missing element, invalid input).
- Test the action returns a valid snapshot with updated refs.

### Result Shape

All actions return the same shape. This is important for consistency:

```typescript
{
  success: boolean;
  snapshot: PageSnapshot;
  url: string;
  error?: string;
}
```

---

## Known Pitfalls

### The `__name` Bug in `page.evaluate()`

When running in development mode with `npx tsx`, the transpiler injects `__name` decorator calls around named function declarations. Code passed to Playwright's `page.evaluate()` runs inside the browser context, where `__name` does not exist. This causes a `ReferenceError: __name is not defined`.

**Always use arrow function expressions inside `page.evaluate()`:**

```typescript
// WRONG -- will crash in the browser context
await page.evaluate(() => {
  function helper() { /* ... */ }  // tsx wraps this with __name()
});

// CORRECT
await page.evaluate(() => {
  const helper = () => { /* ... */ };  // arrow functions are safe
});
```

A global `__name` shim is injected via `addInitScript()` in `src/browser/session.ts` as a safety net, but you should not rely on it. Always use arrow functions.

---

## Pull Request Process

1. **Fork the repository** and create a feature branch from `main`.

2. **Make your changes.** Follow the code style guidelines and existing patterns in the codebase.

3. **Run all checks before submitting:**

   ```bash
   npm run lint:fix    # Fix formatting issues
   npm run typecheck   # Verify types
   npm test            # Run all tests
   ```

4. **Write a clear PR description:**
   - Describe what changed and why.
   - Reference any related issues (e.g., "Fixes #12").
   - Note any breaking changes.

5. **Keep PRs focused.** One feature or fix per pull request. Large refactors should be discussed in an issue first.

6. **CI must pass.** The GitHub Actions pipeline runs lint, typecheck, build, unit tests, integration tests, and a Docker build. All checks must pass before merge.

### What We Look For

- Code follows the existing patterns and style.
- New actions follow the six-step process documented above.
- Tests cover the happy path and relevant error cases.
- No unrelated changes or formatting noise in the diff.
- Commit messages are clear and describe the change.

---

## Reporting Issues

Open an issue on [GitHub Issues](https://github.com/enderekici/steer/issues) with the following information:

### Bug Reports

- **steer version** (from `package.json` or `npm list steer`)
- **Node.js version** (`node --version`)
- **Operating system** and architecture
- **Browser engine** (`firefox`, `chromium`, or `webkit`)
- **Steps to reproduce** the issue
- **Expected behavior** vs. **actual behavior**
- **Error output** or logs (set `STEER_LOG_LEVEL=debug` for verbose output)

### Feature Requests

- **Describe the use case.** What are you trying to accomplish?
- **Describe the proposed solution.** How should it work?
- **Alternatives considered.** What other approaches did you evaluate?

Check the [ROADMAP.md](ROADMAP.md) before requesting a feature -- it may already be planned or explicitly out of scope.

---

## License

By contributing to steer, you agree that your contributions will be licensed under the [MIT License](LICENSE).
