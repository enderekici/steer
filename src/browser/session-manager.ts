import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { SessionNotFoundError, SessionLimitError } from "../utils/errors.js";
import { BrowserEngine } from "./engine.js";
import { Session, type SessionCreateOptions } from "./session.js";

interface SessionInfo {
  id: string;
  url: string;
  createdAt: number;
  lastActivity: number;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private engine: BrowserEngine;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(engine: BrowserEngine) {
    this.engine = engine;

    // Run cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30_000);

    // Allow the process to exit even if the interval is still active
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async createSession(options?: SessionCreateOptions): Promise<Session> {
    if (this.sessions.size >= config.maxSessions) {
      throw new SessionLimitError(config.maxSessions);
    }

    const browser = this.engine.getBrowser();
    const session = await Session.create(browser, options);
    this.sessions.set(session.id, session);

    logger.info(
      { sessionId: session.id, activeSessions: this.sessions.size },
      "Session registered",
    );

    return session;
  }

  getSession(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    session.touch();
    return session;
  }

  async destroySession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }

    await session.close();
    this.sessions.delete(id);

    logger.info(
      { sessionId: id, activeSessions: this.sessions.size },
      "Session destroyed",
    );
  }

  listSessions(): SessionInfo[] {
    const list: SessionInfo[] = [];
    for (const session of this.sessions.values()) {
      list.push({
        id: session.id,
        url: session.page.url(),
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      });
    }
    return list;
  }

  async destroyAll(): Promise<void> {
    logger.info(
      { count: this.sessions.size },
      "Destroying all sessions",
    );

    const closeTasks = [...this.sessions.values()].map((s) => s.close());
    await Promise.allSettled(closeTasks);
    this.sessions.clear();
  }

  private cleanup(): void {
    const timeoutMs = config.sessionTimeoutMs;
    for (const [id, session] of this.sessions) {
      if (session.isExpired(timeoutMs)) {
        logger.info({ sessionId: id }, "Session expired, cleaning up");
        session.close().catch((err) => {
          logger.error({ sessionId: id, err }, "Error closing expired session");
        });
        this.sessions.delete(id);
      }
    }
  }

  stopCleanup(): void {
    clearInterval(this.cleanupInterval);
  }
}
