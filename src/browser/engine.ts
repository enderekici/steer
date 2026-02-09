import { type Browser, type BrowserType, chromium, firefox, webkit } from 'playwright';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const browserTypes: Record<string, BrowserType> = {
  chromium,
  firefox,
  webkit,
};

export class BrowserEngine {
  private browser: Browser | null = null;

  async launch(
    cfg: {
      browser?: string;
      headless?: boolean;
      viewportWidth?: number;
      viewportHeight?: number;
    } = {},
  ): Promise<void> {
    if (this.browser) {
      logger.warn('Browser already launched, closing existing instance');
      await this.close();
    }

    const browserName = cfg.browser ?? config.browser;
    const headless = cfg.headless ?? config.headless;

    const browserType = browserTypes[browserName];
    if (!browserType) {
      throw new Error(`Unsupported browser type: ${browserName}`);
    }

    // Point Playwright to the cached browser binaries
    process.env.PLAYWRIGHT_BROWSERS_PATH =
      process.env.PLAYWRIGHT_BROWSERS_PATH ?? `${process.env.HOME}/.cache/ms-playwright`;

    logger.info({ browser: browserName, headless }, 'Launching browser');

    const executablePath = process.env.STEER_EXECUTABLE_PATH || undefined;

    this.browser = await browserType.launch({
      headless,
      executablePath,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    this.browser.on('disconnected', () => {
      logger.warn('Browser disconnected unexpectedly');
      this.browser = null;
    });

    logger.info({ browser: browserName }, 'Browser launched successfully');
  }

  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() before accessing the browser.');
    }
    return this.browser;
  }

  isRunning(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  async close(): Promise<void> {
    if (this.browser) {
      logger.info('Closing browser');
      try {
        await this.browser.close();
      } catch (err) {
        logger.error({ err }, 'Error closing browser');
      } finally {
        this.browser = null;
      }
    }
  }
}

export const browserEngine = new BrowserEngine();
