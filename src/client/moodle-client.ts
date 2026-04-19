import pRetry, { AbortError } from 'p-retry';
import {
  MoodleTimeoutError,
  MoodleTokenError,
  MoodleWsError,
} from './errors.js';
import {
  createTokenBucketLimiter,
  type RateLimiter,
} from '../utils/rate-limit.js';

/**
 * Errorcodes returned by Moodle that indicate the token is invalid, expired,
 * or the token's owner account is unusable. All are non-retryable.
 */
const TOKEN_ERROR_CODES: ReadonlySet<string> = new Set([
  'invalidtoken',
  'wsaccessuserdeleted',
  'wsaccessusersuspended',
  'wsaccessusercannotlogin',
  'wsaccessusernotpublished',
  'wsaccessuserrestricted',
]);

/**
 * Codes this client attaches to `MoodleWsError` subclasses so callers can
 * branch without pattern-matching on messages.
 */
export const CLIENT_ERROR_CODES = {
  NETWORK: 'MOODLE_WS_NETWORK_ERROR',
  HTTP_4XX: 'MOODLE_WS_HTTP_4XX',
  HTTP_5XX: 'MOODLE_WS_HTTP_5XX',
  BAD_JSON: 'MOODLE_WS_BAD_JSON',
  EXCEPTION: 'MOODLE_WS_EXCEPTION',
} as const;

export interface MoodleClient {
  /** Base URL of the Moodle instance (no trailing slash, no `/webservice/...`). */
  readonly baseUrl: string;
  call<T = unknown>(
    functionName: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
}

export interface MoodleClientOptions {
  url: string;
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Pre-built rate limiter. If omitted, one is created from `tokensPerSec`. */
  rateLimiter?: RateLimiter;
  tokensPerSec?: number;
  /**
   * Injectable fetch for tests. Defaults to the global `fetch`.
   * Unit tests pass a mock here; nock is not used because it does not
   * intercept Node 20+ native fetch (undici) reliably.
   */
  fetch?: typeof fetch;
  /** Backoff base. Default 1000 ms → waits 1s, 2s, 4s between retries. */
  retryMinTimeoutMs?: number;
  /** Backoff factor. Default 2. */
  retryFactor?: number;
}

/**
 * Replace every occurrence of `token` in `s` with `***`. Never throw.
 */
export function redactToken(s: string, token: string): string {
  if (!token) return s;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s.replace(new RegExp(escaped, 'g'), '***');
}

/**
 * Flatten a nested params object into Moodle's `options[0][name]=x` query
 * conventions. Skips `undefined` and `null` values.
 */
export function flattenParams(
  params: Record<string, unknown>,
  prefix = '',
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    const composite = prefix === '' ? key : `${prefix}[${key}]`;
    if (Array.isArray(raw)) {
      raw.forEach((item, i) => {
        const childKey = `${composite}[${i}]`;
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          out.push(...flattenParams(item as Record<string, unknown>, childKey));
        } else if (Array.isArray(item)) {
          // unlikely for Moodle, but handle: nest by numeric index
          item.forEach((inner, j) =>
            out.push([`${childKey}[${j}]`, String(inner)]),
          );
        } else {
          out.push([childKey, String(item)]);
        }
      });
    } else if (typeof raw === 'object') {
      out.push(...flattenParams(raw as Record<string, unknown>, composite));
    } else if (typeof raw === 'boolean') {
      out.push([composite, raw ? '1' : '0']);
    } else {
      out.push([composite, String(raw)]);
    }
  }
  return out;
}

interface MoodleExceptionPayload {
  exception?: string;
  errorcode?: string;
  message?: string;
  debuginfo?: string;
}

function isExceptionPayload(v: unknown): v is MoodleExceptionPayload {
  return (
    typeof v === 'object' &&
    v !== null &&
    'exception' in v &&
    typeof (v as { exception: unknown }).exception === 'string'
  );
}

function isAbortError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e as { name: string }).name === 'AbortError'
  );
}

export function createMoodleClient(opts: MoodleClientOptions): MoodleClient {
  const baseUrl = opts.url.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/webservice/rest/server.php`;
  const token = opts.token;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRetries = opts.maxRetries ?? 3;
  const rateLimiter =
    opts.rateLimiter ??
    createTokenBucketLimiter({ tokensPerSec: opts.tokensPerSec ?? 10 });
  const fetchFn = opts.fetch ?? fetch;
  const retryMinTimeoutMs = opts.retryMinTimeoutMs ?? 1000;
  const retryFactor = opts.retryFactor ?? 2;

  async function callOnce<T>(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    await rateLimiter.acquire();

    const form = new URLSearchParams();
    form.set('wstoken', token);
    form.set('wsfunction', functionName);
    form.set('moodlewsrestformat', 'json');
    for (const [k, v] of flattenParams(params)) form.append(k, v);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      try {
        response = await fetchFn(endpoint, {
          method: 'POST',
          body: form,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          signal: controller.signal,
        });
      } catch (err) {
        if (isAbortError(err)) {
          throw new MoodleTimeoutError(
            `Request to ${functionName} timed out after ${timeoutMs}ms`,
            { functionName, timeoutMs },
          );
        }
        const message =
          err instanceof Error ? err.message : 'unknown network error';
        throw new MoodleWsError(
          `Network error calling ${functionName}: ${redactToken(message, token)}`,
          {
            code: CLIENT_ERROR_CODES.NETWORK,
            functionName,
            cause: err,
          },
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const sanitized = redactToken(body, token);
        const is5xx = response.status >= 500;
        throw new MoodleWsError(
          `Moodle WS returned HTTP ${response.status} for ${functionName}`,
          {
            code: is5xx ? CLIENT_ERROR_CODES.HTTP_5XX : CLIENT_ERROR_CODES.HTTP_4XX,
            functionName,
            details: {
              status: response.status,
              body: sanitized.slice(0, 500),
            },
          },
        );
      }

      const text = await response.text();
      let json: unknown;
      try {
        json = text === '' ? null : JSON.parse(text);
      } catch (e) {
        throw new MoodleWsError(
          `Invalid JSON from Moodle for ${functionName}`,
          {
            code: CLIENT_ERROR_CODES.BAD_JSON,
            functionName,
            cause: e,
          },
        );
      }

      if (isExceptionPayload(json)) {
        const errorcode = json.errorcode ?? 'unknown';
        const message = redactToken(
          json.message ?? json.exception ?? 'Moodle returned an error',
          token,
        );
        if (TOKEN_ERROR_CODES.has(errorcode)) {
          throw new MoodleTokenError(message, {
            functionName,
            details: {
              exception: json.exception,
              errorcode,
              debuginfo: json.debuginfo,
            },
          });
        }
        throw new MoodleWsError(message, {
          code: CLIENT_ERROR_CODES.EXCEPTION,
          functionName,
          details: {
            exception: json.exception,
            errorcode,
            debuginfo: json.debuginfo,
          },
        });
      }

      return json as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set([
    CLIENT_ERROR_CODES.HTTP_4XX,
    CLIENT_ERROR_CODES.EXCEPTION,
    CLIENT_ERROR_CODES.BAD_JSON,
  ]);

  return {
    baseUrl,
    async call<T = unknown>(
      functionName: string,
      params: Record<string, unknown> = {},
    ): Promise<T> {
      return pRetry(
        async () => {
          try {
            return await callOnce<T>(functionName, params);
          } catch (e) {
            if (e instanceof MoodleTokenError) {
              throw new AbortError(e);
            }
            if (
              e instanceof MoodleWsError &&
              NON_RETRYABLE_CODES.has(e.code)
            ) {
              throw new AbortError(e);
            }
            throw e;
          }
        },
        {
          retries: maxRetries,
          minTimeout: retryMinTimeoutMs,
          factor: retryFactor,
        },
      );
    },
  };
}
