import { nanoid } from 'nanoid';
import type { Browser, BrowserContext, ElementHandle, Page } from 'playwright';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface RefElement {
  ref: string;
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  options?: string[];
  description?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  refs: RefElement[];
}

export interface SessionCreateOptions {
  profileName?: string;
  viewport?: { width: number; height: number };
  blockResources?: string[];
}

export class Session {
  readonly id: string;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly refs: Map<string, ElementHandle> = new Map();
  readonly createdAt: number;
  lastActivity: number;
  profileName?: string;

  private constructor(id: string, context: BrowserContext, page: Page, profileName?: string) {
    this.id = id;
    this.context = context;
    this.page = page;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.profileName = profileName;
  }

  static async create(browser: Browser, options: SessionCreateOptions = {}): Promise<Session> {
    const id = nanoid();
    const viewport = options.viewport ?? {
      width: config.viewportWidth,
      height: config.viewportHeight,
    };

    const context = await browser.newContext({
      viewport,
      acceptDownloads: false,
    });

    const page = await context.newPage();

    // tsx/esbuild with keepNames:true wraps const assignments inside
    // page.evaluate() with __name(), which doesn't exist in the browser.
    // Inject a global shim so it becomes a harmless no-op.
    await context.addInitScript(
      "if(typeof __name==='undefined'){var __name=(t,v)=>(Object.defineProperty(t,'name',{value:v,configurable:true}),t)}",
    );

    const blockResources = options.blockResources ?? config.blockResources;

    if (blockResources.length > 0) {
      await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (blockResources.includes(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });
    }

    logger.info({ sessionId: id, viewport, blockResources }, 'Session created');

    return new Session(id, context, page, options.profileName);
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  isExpired(timeoutMs: number): boolean {
    return Date.now() - this.lastActivity > timeoutMs;
  }

  getElementByRef(ref: string): ElementHandle | undefined {
    return this.refs.get(ref);
  }

  async close(): Promise<void> {
    logger.info({ sessionId: this.id }, 'Closing session');
    try {
      await this.context.close();
    } catch (err) {
      logger.error({ sessionId: this.id, err }, 'Error closing session context');
    }
  }
}
