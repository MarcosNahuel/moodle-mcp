import { describe, it, expect, vi } from 'vitest';
import { upsertUrlOp } from '../../../src/tools/contenido/publicar_ficha_clase.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

type Scripts = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;

function scriptedClient(scripts: Scripts, baseUrl = 'https://aula.example.com'): MoodleClient {
  return {
    baseUrl,
    async call(functionName, params = {}) {
      const fn = scripts[functionName];
      if (!fn) throw new Error(`unexpected WS call: ${functionName}`);
      return await fn(params);
    },
  };
}

const baseOp = {
  kind: 'upsert_url' as const,
  idnumber: 'mcp:module:abcd1234',
  component_id: 'link-1',
  name: 'Quizlet — vocabolario Unità 3',
  externalurl: 'https://quizlet.com/set/12345',
  visible: false,
};

const scope = { courseId: 42, sectionnum: 3 };

describe('upsertUrlOp', () => {
  it('calls local_italiciamcp_upsert_url with the expected params on create', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      local_italiciamcp_upsert_url: (params) => {
        calls.push({ fn: 'local_italiciamcp_upsert_url', params });
        return {
          action: 'created',
          cmid: 777,
          instanceid: 88,
          url: 'https://aula.example.com/mod/url/view.php?id=777',
        };
      },
    });

    const result = await upsertUrlOp({ client, logger: nullLogger }, baseOp, scope);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toEqual({
      courseid: 42,
      sectionnum: 3,
      idnumber: baseOp.idnumber,
      name: baseOp.name,
      externalurl: baseOp.externalurl,
      intro: '',
      display: 0,
      visible: 0,
    });
    expect(result).toEqual({
      component_id: 'link-1',
      moodle_id: 777,
      tipo: 'url',
      url: 'https://aula.example.com/mod/url/view.php?id=777',
      idnumber: baseOp.idnumber,
      status: 'created',
    });
  });

  it('passes visible=1 when op.visible is true', async () => {
    const seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_italiciamcp_upsert_url: (params) => {
        Object.assign(seen, params);
        return { action: 'updated', cmid: 1, instanceid: 1, url: 'https://x' };
      },
    });

    await upsertUrlOp({ client, logger: nullLogger }, { ...baseOp, visible: true }, scope);

    expect(seen.visible).toBe(1);
  });

  it('returns status=missing and logs a warning when the WS call throws', async () => {
    const logger = { ...nullLogger, warn: vi.fn() };
    const client = scriptedClient({
      local_italiciamcp_upsert_url: () => {
        throw new Error('plugin not installed');
      },
    });

    const result = await upsertUrlOp({ client, logger }, baseOp, scope);

    expect(result.status).toBe('missing');
    expect(result.moodle_id).toBeNull();
    expect(result.url).toBeNull();
    expect(result.tipo).toBe('url');
    expect(logger.warn).toHaveBeenCalledWith(
      'upsert_url.failed',
      expect.objectContaining({
        idnumber: baseOp.idnumber,
        error: 'plugin not installed',
      }),
    );
  });

  it('returns status=updated when the WS reports an update', async () => {
    const client = scriptedClient({
      local_italiciamcp_upsert_url: () => ({
        action: 'updated',
        cmid: 5,
        instanceid: 9,
        url: 'https://aula.example.com/mod/url/view.php?id=5',
      }),
    });

    const result = await upsertUrlOp({ client, logger: nullLogger }, baseOp, scope);

    expect(result.status).toBe('updated');
    expect(result.moodle_id).toBe(5);
  });
});
