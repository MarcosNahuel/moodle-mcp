import { describe, it, expect } from 'vitest';
import {
  MoodleWsError,
  MoodleTokenError,
  MoodleTimeoutError,
  MoodlePluginMissingError,
  isMoodleWsError,
} from '../../src/client/errors.js';

describe('MoodleWsError', () => {
  it('has default code MOODLE_WS_ERROR', () => {
    const e = new MoodleWsError('boom');
    expect(e.code).toBe('MOODLE_WS_ERROR');
    expect(e.name).toBe('MoodleWsError');
    expect(e.message).toBe('boom');
  });

  it('accepts custom code, functionName and details', () => {
    const e = new MoodleWsError('bad', {
      code: 'MOODLE_WS_HTTP_500',
      functionName: 'core_course_get_contents',
      details: { status: 500 },
    });
    expect(e.code).toBe('MOODLE_WS_HTTP_500');
    expect(e.functionName).toBe('core_course_get_contents');
    expect(e.details).toEqual({ status: 500 });
  });

  it('preserves cause', () => {
    const cause = new Error('root');
    const e = new MoodleWsError('wrap', { cause });
    expect(e.cause).toBe(cause);
  });

  it('toClientPayload omits undefined optional fields', () => {
    const e = new MoodleWsError('x');
    expect(e.toClientPayload()).toEqual({
      code: 'MOODLE_WS_ERROR',
      message: 'x',
    });
  });

  it('toClientPayload includes optional fields when set', () => {
    const e = new MoodleWsError('x', {
      functionName: 'f',
      details: { a: 1 },
    });
    expect(e.toClientPayload()).toEqual({
      code: 'MOODLE_WS_ERROR',
      message: 'x',
      functionName: 'f',
      details: { a: 1 },
    });
  });
});

describe('MoodleTokenError', () => {
  it('is a MoodleWsError with fixed code', () => {
    const e = new MoodleTokenError();
    expect(e).toBeInstanceOf(MoodleWsError);
    expect(e).toBeInstanceOf(MoodleTokenError);
    expect(e.code).toBe('MOODLE_WS_TOKEN_INVALID');
    expect(e.name).toBe('MoodleTokenError');
    expect(e.message).toMatch(/token/i);
  });

  it('accepts a custom message', () => {
    const e = new MoodleTokenError('expired at T');
    expect(e.message).toBe('expired at T');
    expect(e.code).toBe('MOODLE_WS_TOKEN_INVALID');
  });
});

describe('MoodleTimeoutError', () => {
  it('is a MoodleWsError with fixed code and carries timeoutMs', () => {
    const e = new MoodleTimeoutError('slow', { timeoutMs: 30000 });
    expect(e).toBeInstanceOf(MoodleWsError);
    expect(e.code).toBe('MOODLE_WS_TIMEOUT');
    expect(e.timeoutMs).toBe(30000);
  });

  it('has a sensible default message', () => {
    const e = new MoodleTimeoutError();
    expect(e.message).toMatch(/timed out/i);
  });
});

describe('MoodlePluginMissingError', () => {
  it('carries plugin name and default install hint', () => {
    const e = new MoodlePluginMissingError('qbank_importexport');
    expect(e).toBeInstanceOf(MoodleWsError);
    expect(e.code).toBe('MOODLE_PLUGIN_MISSING');
    expect(e.plugin).toBe('qbank_importexport');
    expect(e.message).toContain('qbank_importexport');
    expect(e.message).toContain('moodle.org/plugins');
  });

  it('accepts a custom message', () => {
    const e = new MoodlePluginMissingError('foo', 'need foo');
    expect(e.message).toBe('need foo');
    expect(e.plugin).toBe('foo');
  });
});

describe('isMoodleWsError', () => {
  it('recognises the whole hierarchy', () => {
    expect(isMoodleWsError(new MoodleWsError('x'))).toBe(true);
    expect(isMoodleWsError(new MoodleTokenError())).toBe(true);
    expect(isMoodleWsError(new MoodleTimeoutError())).toBe(true);
    expect(isMoodleWsError(new MoodlePluginMissingError('p'))).toBe(true);
  });

  it('returns false for plain errors', () => {
    expect(isMoodleWsError(new Error('x'))).toBe(false);
    expect(isMoodleWsError('x')).toBe(false);
    expect(isMoodleWsError(null)).toBe(false);
  });
});
