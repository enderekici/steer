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

    // Firefox-specific args for Docker environments
    const firefoxArgs =
      browserName === 'firefox'
        ? [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '-silent', // Suppress startup messages
          ]
        : ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];

    // Firefox-specific environment variables
    const firefoxEnv =
      browserName === 'firefox'
        ? {
            // Use tmp directory for cache to avoid permission issues in containers
            XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || '/tmp/firefox-cache',
            // Disable dconf to avoid cache directory errors
            DCONF_PROFILE: '',
            // Suppress fontconfig warnings
            FONTCONFIG_PATH: '/etc/fonts',
          }
        : {};

    this.browser = await browserType.launch({
      headless,
      executablePath,
      args: firefoxArgs,
      ...(Object.keys(firefoxEnv).length > 0 && {
        env: { ...process.env, ...firefoxEnv },
      }),
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
