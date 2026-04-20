import { describe, it, expect, vi } from 'vitest';
import { wsRawTool } from '../../src/tools/primitive/ws_raw.js';
import {
  MoodleTokenError,
  MoodleWsError,
} from '../../src/client/errors.js';
import { nullLogger } from '../../src/utils/logger.js';
import type { MoodleClient } from '../../src/client/moodle-client.js';
import type { ToolContext } from '../../src/tools/types.js';

function fakeClient(impl: MoodleClient['call']): MoodleClient {
  return { baseUrl: 'https://aula.example.com', call: impl };
}

function ctx(client: MoodleClient): ToolContext {
  return { client, logger: nullLogger };
}

describe('wsRawTool — metadata', () => {
  it('has the expected name and description', () => {
    expect(wsRawTool.name).toBe('ws_raw');
    expect(wsRawTool.description).toMatch(/escape hatch/i);
  });
});

describe('wsRawTool.inputSchema', () => {
  it('accepts a minimal call with defaults', () => {
    const parsed = wsRawTool.inputSchema.parse({ function_name: 'core_course_get_courses' });
    expect(parsed.function_name).toBe('core_course_get_courses');
    expect(parsed.params).toEqual({});
  });

  it('accepts params object', () => {
    const parsed = wsRawTool.inputSchema.parse({
      function_name: 'core_course_get_courses',
      params: { options: { ids: [1, 2] } },
    });
    expect(parsed.params).toEqual({ options: { ids: [1, 2] } });
  });

  it('rejects missing function_name', () => {
    expect(() => wsRawTool.inputSchema.parse({})).toThrow();
  });

  it('rejects function_name with invalid characters', () => {
    expect(() =>
      wsRawTool.inputSchema.parse({ function_name: 'bad name!' }),
    ).toThrow();
    expect(() =>
      wsRawTool.inputSchema.parse({ function_name: '/etc/passwd' }),
    ).toThrow();
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(() =>
      wsRawTool.inputSchema.parse({ function_name: 'x', extra: 1 }),
    ).toThrow();
  });
});

describe('wsRawTool.handler — happy path', () => {
  it('passes function name and params through to the client', async () => {
    const call = vi.fn(async () => ({ sitename: 'Italicia' }));
    const res = await wsRawTool.handler(
      { function_name: 'core_webservice_get_site_info', params: { foo: 'bar' } },
      ctx(fakeClient(call)),
    );
    expect(call).toHaveBeenCalledWith('core_webservice_get_site_info', {
      foo: 'bar',
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0]!.type).toBe('text');
    expect(JSON.parse(res.content[0]!.text)).toEqual({
      data: { sitename: 'Italicia' },
    });
  });

  it('wraps any return value inside { data }', async () => {
    const res = await wsRawTool.handler(
      { function_name: 'x', params: {} },
      ctx(fakeClient(async () => [1, 2, 3])),
    );
    expect(JSON.parse(res.content[0]!.text)).toEqual({ data: [1, 2, 3] });
  });
});

describe('wsRawTool.handler — errors', () => {
  it('maps MoodleTokenError to isError with token payload', async () => {
    const res = await wsRawTool.handler(
      { function_name: 'x', params: {} },
      ctx(
        fakeClient(async () => {
          throw new MoodleTokenError('invalid token', { functionName: 'x' });
        }),
      ),
    );
    expect(res.isError).toBe(true);
    expect(res.meta).toMatchObject({
      code: 'MOODLE_WS_TOKEN_INVALID',
      functionName: 'x',
    });
    expect(res.content[0]!.text).toMatch(/invalid token/i);
  });

  it('maps generic MoodleWsError with its code and details', async () => {
    const res = await wsRawTool.handler(
      { function_name: 'x', params: {} },
      ctx(
        fakeClient(async () => {
          throw new MoodleWsError('bad request', {
            code: 'MOODLE_WS_HTTP_4XX',
            details: { status: 400 },
          });
        }),
      ),
    );
    expect(res.isError).toBe(true);
    expect(res.meta).toMatchObject({
      code: 'MOODLE_WS_HTTP_4XX',
      details: { status: 400 },
    });
  });

  it('wraps unexpected errors in a generic MOODLE_WS_ERROR shape', async () => {
    const res = await wsRawTool.handler(
      { function_name: 'x', params: {} },
      ctx(
        fakeClient(async () => {
          throw new TypeError('something unexpected');
        }),
      ),
    );
    expect(res.isError).toBe(true);
    expect(res.meta).toMatchObject({ code: 'MOODLE_WS_ERROR' });
    expect(res.content[0]!.text).toContain('something unexpected');
  });
});
