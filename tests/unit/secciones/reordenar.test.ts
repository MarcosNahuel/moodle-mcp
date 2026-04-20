import { describe, it, expect, vi } from 'vitest';
import { reordenarSeccionesTool } from '../../../src/tools/secciones/reordenar_secciones.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

type Scripts = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;

function scriptedClient(scripts: Scripts, baseUrl = 'https://aula.example.com'): MoodleClient {
  return {
    baseUrl,
    async call(fn, params = {}) {
      const f = scripts[fn];
      if (!f) throw new Error(`unexpected WS call: ${fn}`);
      return await f(params);
    },
  };
}

function ctx(client: MoodleClient) {
  return { client, logger: nullLogger };
}

describe('reordenar_secciones', () => {
  it('sends a batched update with position per section', async () => {
    let captured: Record<string, unknown> = {};
    const client = scriptedClient({
      local_wsmanagesections_update_sections: (params) => {
        captured = params;
        return [];
      },
    });

    const result = await reordenarSeccionesTool.handler(
      {
        course_id: 42,
        order: [
          { section_id: 10, position: 0 },
          { section_id: 20, position: 1 },
          { section_id: 30, position: 2 },
        ],
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('"reordered":3');

    expect(captured.courseid).toBe(42);
    const sections = captured.sections as Array<Record<string, unknown>>;
    expect(sections).toHaveLength(3);
    expect(sections[0]).toEqual({ type: 'id', section: 10, position: 0 });
    expect(sections[1]).toEqual({ type: 'id', section: 20, position: 1 });
    expect(sections[2]).toEqual({ type: 'id', section: 30, position: 2 });
  });

  it('rejects empty order', () => {
    expect(() =>
      reordenarSeccionesTool.inputSchema.parse({ course_id: 42, order: [] }),
    ).toThrow();
  });

  it('surfaces WS errors as tool error responses', async () => {
    const logger = { ...nullLogger, warn: vi.fn() };
    const client = scriptedClient({
      local_wsmanagesections_update_sections: () => {
        throw new Error('section not found');
      },
    });

    const result = await reordenarSeccionesTool.handler(
      { course_id: 42, order: [{ section_id: 999, position: 0 }] },
      { client, logger },
    );

    expect(result.isError).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'reordenar_secciones.failed',
      expect.objectContaining({ course_id: 42, count: 1 }),
    );
  });
});
