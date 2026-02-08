export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class SessionNotFoundError extends AppError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 404, 'SESSION_NOT_FOUND');
  }
}

export class SessionLimitError extends AppError {
  constructor(max: number) {
    super(`Maximum session limit reached (${max})`, 429, 'SESSION_LIMIT_REACHED');
  }
}

export class NavigationError extends AppError {
  constructor(url: string, reason?: string) {
    const detail = reason ? `: ${reason}` : '';
    super(`Navigation failed for ${url}${detail}`, 502, 'NAVIGATION_FAILED');
  }
}

export class ActionError extends AppError {
  constructor(action: string, reason?: string) {
    const detail = reason ? `: ${reason}` : '';
    super(`Action failed: ${action}${detail}`, 400, 'ACTION_FAILED');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class DomainNotAllowedError extends AppError {
  constructor(domain: string) {
    super(`Domain not allowed: ${domain}`, 403, 'DOMAIN_NOT_ALLOWED');
  }
}
