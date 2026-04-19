import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../../src/config.js';

const baseEnv: NodeJS.ProcessEnv = {
  MOODLE_URL: 'https://aula.example.com',
  MOODLE_WS_TOKEN: 'abc123',
};

describe('loadConfig', () => {
  it('returns parsed config with defaults when only required vars are set', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.moodleUrl).toBe('https://aula.example.com');
    expect(cfg.moodleWsToken).toBe('abc123');
    expect(cfg.timeoutMs).toBe(30000);
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.rateLimitPerSec).toBe(10);
    expect(cfg.logLevel).toBe('info');
  });

  it('throws ConfigError listing missing required vars', () => {
    const err = (() => {
      try {
        loadConfig({});
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as Error).message).toContain('MOODLE_URL');
    expect((err as Error).message).toContain('MOODLE_WS_TOKEN');
  });

  it('throws ConfigError when only MOODLE_URL is missing', () => {
    expect(() => loadConfig({ MOODLE_WS_TOKEN: 'x' })).toThrow(ConfigError);
    expect(() => loadConfig({ MOODLE_WS_TOKEN: 'x' })).toThrow(/MOODLE_URL/);
  });

  it('rejects http:// URLs by default', () => {
    expect(() =>
      loadConfig({ ...baseEnv, MOODLE_URL: 'http://aula.example.com' }),
    ).toThrow(/HTTPS/);
  });

  it('accepts http:// URLs when MOODLE_ALLOW_INSECURE=true', () => {
    const cfg = loadConfig({
      ...baseEnv,
      MOODLE_URL: 'http://localhost:8080',
      MOODLE_ALLOW_INSECURE: 'true',
    });
    expect(cfg.moodleUrl).toBe('http://localhost:8080');
  });

  it('rejects malformed URLs', () => {
    expect(() => loadConfig({ ...baseEnv, MOODLE_URL: 'not-a-url' })).toThrow(ConfigError);
  });

  it('rejects empty token', () => {
    expect(() => loadConfig({ ...baseEnv, MOODLE_WS_TOKEN: '' })).toThrow(ConfigError);
  });

  it('parses numeric env vars correctly', () => {
    const cfg = loadConfig({
      ...baseEnv,
      MOODLE_WS_TIMEOUT_MS: '5000',
      MOODLE_WS_MAX_RETRIES: '0',
      MOODLE_WS_RATE_LIMIT_PER_SEC: '25',
    });
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.maxRetries).toBe(0);
    expect(cfg.rateLimitPerSec).toBe(25);
  });

  it('rejects non-numeric numeric env vars with a clear message', () => {
    expect(() =>
      loadConfig({ ...baseEnv, MOODLE_WS_TIMEOUT_MS: 'abc' }),
    ).toThrow(/MOODLE_WS_TIMEOUT_MS/);
  });

  it('rejects negative timeout', () => {
    expect(() =>
      loadConfig({ ...baseEnv, MOODLE_WS_TIMEOUT_MS: '-5' }),
    ).toThrow(ConfigError);
  });

  it('accepts all valid log levels and normalizes case', () => {
    for (const level of ['error', 'warn', 'info', 'debug']) {
      const cfg = loadConfig({ ...baseEnv, MCP_LOG_LEVEL: level.toUpperCase() });
      expect(cfg.logLevel).toBe(level);
    }
  });

  it('rejects invalid log level', () => {
    expect(() => loadConfig({ ...baseEnv, MCP_LOG_LEVEL: 'trace' })).toThrow(ConfigError);
  });
});
