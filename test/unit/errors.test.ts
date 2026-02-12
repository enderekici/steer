process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it } from 'vitest';
import {
  ActionError,
  AppError,
  DomainNotAllowedError,
  SessionLimitError,
  SessionNotFoundError,
  ValidationError,
} from '../../src/utils/errors.js';

describe('AppError', () => {
  it('should set message, statusCode, and code', () => {
    const err = new AppError('test message', 500, 'TEST_ERROR');
    expect(err.message).toBe('test message');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TEST_ERROR');
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('SessionNotFoundError', () => {
  it('should have statusCode 404 and SESSION_NOT_FOUND code', () => {
    const err = new SessionNotFoundError('sess-abc');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('SESSION_NOT_FOUND');
    expect(err.message).toContain('sess-abc');
    expect(err.name).toBe('SessionNotFoundError');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('SessionLimitError', () => {
  it('should have statusCode 429 and SESSION_LIMIT_REACHED code', () => {
    const err = new SessionLimitError(10);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('SESSION_LIMIT_REACHED');
    expect(err.message).toContain('10');
    expect(err.name).toBe('SessionLimitError');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('ActionError', () => {
  it('should have statusCode 400 and ACTION_FAILED code', () => {
    const err = new ActionError('click');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('ACTION_FAILED');
    expect(err.message).toContain('click');
    expect(err.name).toBe('ActionError');
    expect(err).toBeInstanceOf(AppError);
  });

  it('should include optional reason in message', () => {
    const err = new ActionError('type', 'element not found');
    expect(err.message).toContain('element not found');
    expect(err.message).toContain('type');
  });

  it('should omit reason detail when reason is not provided', () => {
    const err = new ActionError('scroll');
    expect(err.message).toBe('Action failed: scroll');
  });
});

describe('ValidationError', () => {
  it('should have statusCode 400 and VALIDATION_ERROR code', () => {
    const err = new ValidationError('field is required');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('field is required');
    expect(err.name).toBe('ValidationError');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('DomainNotAllowedError', () => {
  it('should have statusCode 403 and DOMAIN_NOT_ALLOWED code', () => {
    const err = new DomainNotAllowedError('evil.com');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('DOMAIN_NOT_ALLOWED');
    expect(err.message).toContain('evil.com');
    expect(err.name).toBe('DomainNotAllowedError');
    expect(err).toBeInstanceOf(AppError);
  });
});
