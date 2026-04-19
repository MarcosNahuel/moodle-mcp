import { describe, it, expect, vi } from 'vitest';
import {
  createMoodleClient,
  flattenParams,
  redactToken,
  CLIENT_ERROR_CODES,
} from '../../src/client/moodle-client.js';
import {
  MoodleWsError,
  MoodleTokenError,
  MoodleTimeoutError,
} from '../../src/client/errors.js';

// --- test helpers ---

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function makeFetchQueue(items: Array<Response | Error>) {
  const calls: Array<{ url: string; body: string }> = [];
  const queue = [...items];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const body =
      init?.body instanceof URLSearchParams ? init.body.toString() : '';
    calls.push({ url, body });
    const next = queue.shift();
    if (!next) throw new Error('mock fetch queue exhausted');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchFn, calls };
}

const baseOpts = {
  url: 'https://aula.example.com',
  token: 'secret-token-xyz',
  tokensPerSec: 10_000, // rate limit effectively disabled
  retryMinTimeoutMs: 1, // keep retry tests fast
  retryFactor: 1,
};

// --- redactToken ---

describe('redactToken', () => {
  it('replaces every occurrence', () => {
    expect(redactToken('foo TOKEN bar TOKEN baz', 'TOKEN')).toBe(
      'foo *** bar *** baz',
    );
  });

  it('escapes regex metacharacters in the token', () => {
    expect(redactToken('has a.b+c token', 'a.b+c')).toBe('has *** token');
  });

  it('noops on empty token', () => {
    expect(redactToken('abc', '')).toBe('abc');
  });
});

// --- flattenParams ---

describe('flattenParams', () => {
  it('flattens primitives', () => {
    expect(flattenParams({ a: 1, b: 'x', c: true })).toEqual([
      ['a', '1'],
      ['b', 'x'],
      ['c', '1'],
    ]);
  });

  it('skips null and undefined', () => {
    expect(flattenParams({ a: null, b: undefined, c: 'keep' })).toEqual([
      ['c', 'keep'],
    ]);
  });

  it('uses Moodle-style nested object keys', () => {
    expect(flattenParams({ courseid: 1, options: { name: 'x', value: 'y' } }))
      .toEqual([
        ['courseid', '1'],
        ['options[name]', 'x'],
        ['options[value]', 'y'],
      ]);
  });

  it('indexes arrays', () => {
    expect(
      flattenParams({
        options: [
          { name: 'a', value: '1' },
          { name: 'b', value: '2' },
        ],
      }),
    ).toEqual([
      ['options[0][name]', 'a'],
      ['options[0][value]', '1'],
      ['options[1][name]', 'b'],
      ['options[1][value]', '2'],
    ]);
  });
});

// --- call() happy path ---

describe('MoodleClient.call', () => {
  it('POSTs wstoken, wsfunction, format and params to the WS endpoint', async () => {
    const { fetchFn, calls } = makeFetchQueue([jsonResponse({ sitename: 'X' })]);
    const c = createMoodleClient({ ...baseOpts, fetch: fetchFn });
    const res = await c.call('core_webservice_get_site_info', { foo: 'bar' });
    expect(res).toEqual({ sitename: 'X' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://aula.example.com/webservice/rest/server.php',
    );
    const body = calls[0]!.body;
    expect(body).toContain('wstoken=secret-token-xyz');
    expect(body).toContain('wsfunction=core_webservice_get_site_info');
    expect(body).toContain('moodlewsrestformat=json');
    expect(body).toContain('foo=bar');
  });

  it('strips trailing slashes from url', async () => {
    const { fetchFn, calls } = makeFetchQueue([jsonResponse({})]);
    const c = createMoodleClient({
      ...baseOpts,
      url: 'https://aula.example.com///',
      fetch: fetchFn,
    });
    await c.call('x');
    expect(calls[0]!.url).toBe(
      'https://aula.example.com/webservice/rest/server.php',
    );
  });

  // --- Moodle exception mapping ---

  it('maps invalidtoken errorcode to MoodleTokenError and does not retry', async () => {
    const { fetchFn, calls } = makeFetchQueue([
      jsonResponse({
        exception: 'moodle_exception',
        errorcode: 'invalidtoken',
        message: 'Invalid token',
      }),
    ]);
    const c = createMoodleClient({
      ...baseOpts,
      fetch: fetchFn,
      maxRetries: 5,
    });
    await expect(c.call('x')).rejects.toBeInstanceOf(MoodleTokenError);
    expect(calls).toHaveLength(1);
  });

  it('maps generic exception to MoodleWsError with errorcode in details', async () => {
    const { fetchFn } = makeFetchQueue([
      jsonResponse({
        exception: 'invalid_parameter_exception',
        errorcode: 'invalidparametervalue',
        message: 'Bad param',
        debuginfo: 'debug',
      }),
    ]);
    const c = createMoodleClient({ ...baseOpts, fetch: fetchFn });
    try {
      await c.call('x');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MoodleWsError);
      const err = e as MoodleWsError;
      expect(err.code).toBe(CLIENT_ERROR_CODES.EXCEPTION);
      expect(err.details).toMatchObject({
        errorcode: 'invalidparametervalue',
        exception: 'invalid_parameter_exception',
      });
    }
  });

  it('redacts the token from exception messages', async () => {
    const token = 'SUPERSECRET';
    const { fetchFn } = makeFetchQueue([
      jsonResponse({
        exception: 'x',
        errorcode: 'boom',
        message: `token ${token} leaked`,
      }),
    ]);
    const c = createMoodleClient({ ...baseOpts, token, fetch: fetchFn });
    await expect(c.call('x')).rejects.toMatchObject({
      message: expect.stringContaining('***'),
    });
    await expect(c.call('x')).rejects.not.toMatchObject({
      message: expect.stringContaining(token),
    });
  });

  // --- HTTP error mapping ---

  it('maps 4xx to MoodleWsError HTTP_4XX and does not retry', async () => {
    const { fetchFn, calls } = makeFetchQueue([
      textResponse('bad request', 400),
    ]);
    const c = createMoodleClient({
      ...baseOpts,
      fetch: fetchFn,
      maxRetries: 5,
    });
    await expect(c.call('x')).rejects.toMatchObject({
      code: CLIENT_ERROR_CODES.HTTP_4XX,
    });
    expect(calls).toHaveLength(1);
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    const { fetchFn, calls } = makeFetchQueue([
      textResponse('bad gateway', 502),
      jsonResponse({ ok: true }),
    ]);
    const c = createMoodleClient({
      ...baseOpts,
      fetch: fetchFn,
      maxRetries: 3,
    });
    const res = await c.call('x');
    expect(res).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('surfaces the final HTTP_5XX when retries are exhausted', async () => {
    const { fetchFn, calls } = makeFetchQueue([
      textResponse('boom', 500),
      textResponse('boom', 500),
      textResponse('boom', 500),
    ]);
    const c = createMoodleClient({
      ...baseOpts,
      fetch: fetchFn,
      maxRetries: 2,
    });
    await expect(c.call('x')).rejects.toMatchObject({
      code: CLIENT_ERROR_CODES.HTTP_5XX,
    });
    expect(calls).toHaveLength(3); // 1 initial + 2 retries
  });

  it('redacts the token from 4xx body details', async () => {
    const token = 'LEAKY';
    const { fetchFn } = makeFetchQueue([
      textResponse(`server echoed token ${token}`, 400),
    ]);
    const c = createMoodleClient({ ...baseOpts, token, fetch: fetchFn });
    try {
      await c.call('x');
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as MoodleWsError;
      const body = (err.details as { body: string }).body;
      expect(body).not.toContain(token);
      expect(body).toContain('***');
    }
  });

  // --- network + timeout ---

  it('wraps network errors as NETWORK_ERROR and retries', async () => {
    const netErr = new TypeError('fetch failed');
    const { fetchFn, calls } = makeFetchQueue([netErr, jsonResponse({ ok: 1 })]);
    const c = createMoodleClient({ ...baseOpts, fetch: fetchFn, maxRetries: 3 });
    const res = await c.call('x');
    expect(res).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });

  it('maps fetch abort to MoodleTimeoutError', async () => {
    const hangingFetch: typeof fetch = (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          (err as Error & { name: string }).name = 'AbortError';
          reject(err);
        });
      });
    const c = createMoodleClient({
      ...baseOpts,
      fetch: hangingFetch,
      timeoutMs: 30,
      maxRetries: 0,
    });
    await expect(c.call('x')).rejects.toBeInstanceOf(MoodleTimeoutError);
  });

  // --- rate limiter integration ---

  it('calls rateLimiter.acquire() before each fetch', async () => {
    const { fetchFn } = makeFetchQueue([jsonResponse({ a: 1 }), jsonResponse({ a: 2 })]);
    const acquire = vi.fn(async () => undefined);
    const c = createMoodleClient({
      ...baseOpts,
      fetch: fetchFn,
      rateLimiter: { acquire },
    });
    await c.call('x');
    await c.call('y');
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  // --- empty and bad responses ---

  it('returns null for empty body', async () => {
    const { fetchFn } = makeFetchQueue([textResponse('', 200)]);
    const c = createMoodleClient({ ...baseOpts, fetch: fetchFn });
    await expect(c.call('x')).resolves.toBeNull();
  });

  it('throws BAD_JSON on invalid JSON body and does not retry', async () => {
    const { fetchFn, calls } = makeFetchQueue([
      textResponse('<html>not json</html>', 200),
    ]);
    const c = createMoodleClient({
      ...baseOpts,
      fetch: fetchFn,
      maxRetries: 5,
    });
    await expect(c.call('x')).rejects.toMatchObject({
      code: CLIENT_ERROR_CODES.BAD_JSON,
    });
    expect(calls).toHaveLength(1);
  });
});
