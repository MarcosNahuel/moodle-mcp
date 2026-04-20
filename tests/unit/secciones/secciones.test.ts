import { describe, it, expect, vi } from 'vitest';
import { crearSeccionTool } from '../../../src/tools/secciones/crear_seccion.js';
import { actualizarSeccionTool } from '../../../src/tools/secciones/actualizar_seccion.js';
import {
  ocultarSeccionTool,
  liberarSeccionTool,
} from '../../../src/tools/secciones/visibility.js';
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

// ---------- crear_seccion ----------

describe('crear_seccion', () => {
  it('creates a section and updates its name/summary/visibility', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      local_wsmanagesections_create_sections: (params) => {
        calls.push({ fn: 'create', params });
        return [{ sectionid: 123, sectionnumber: 5 }];
      },
      local_wsmanagesections_update_sections: (params) => {
        calls.push({ fn: 'update', params });
        return [];
      },
    });

    const result = await crearSeccionTool.handler(
      {
        course_id: 42,
        name: 'Unità 4 — Famiglia',
        summary: '<p>Descripción</p>',
        position: 0,
        visible: false,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('"section_id":123');
    expect(result.content[0]!.text).toContain('"sectionnum":5');

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      fn: 'create',
      params: { courseid: 42, position: 0, number: 1 },
    });
    expect(calls[1]!.fn).toBe('update');
    const updateSections = (calls[1]!.params as { sections: unknown[] }).sections as Array<
      Record<string, unknown>
    >;
    expect(updateSections).toHaveLength(1);
    expect(updateSections[0]).toMatchObject({
      type: 'id',
      section: 123,
      name: 'Unità 4 — Famiglia',
      summary: '<p>Descripción</p>',
      visible: 0,
    });
  });

  it('returns an error when the plugin returns an empty list', async () => {
    const client = scriptedClient({
      local_wsmanagesections_create_sections: () => [],
      local_wsmanagesections_update_sections: () => [],
    });

    const result = await crearSeccionTool.handler(
      { course_id: 42, name: 'X', summary: '', position: 0, visible: true },
      ctx(client),
    );

    expect(result.isError).toBe(true);
    expect(result.meta?.code).toBe('MOODLE_WS_PLUGIN_ERROR');
  });
});

// ---------- actualizar_seccion ----------

describe('actualizar_seccion', () => {
  it('forwards only the fields that are provided', async () => {
    const seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_wsmanagesections_update_sections: (params) => {
        const sections = (params.sections as Array<Record<string, unknown>>)[0]!;
        Object.assign(seen, sections);
        return [];
      },
    });

    const result = await actualizarSeccionTool.handler(
      {
        course_id: 42,
        section_id: 77,
        name: 'Nueva unidad',
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(seen).toEqual({ type: 'id', section: 77, name: 'Nueva unidad' });
    expect(seen).not.toHaveProperty('summary');
    expect(seen).not.toHaveProperty('visible');
  });

  it('maps summary + summaryformat when summary is set', async () => {
    const seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_wsmanagesections_update_sections: (params) => {
        Object.assign(seen, (params.sections as Array<Record<string, unknown>>)[0]);
        return [];
      },
    });

    await actualizarSeccionTool.handler(
      { course_id: 42, section_id: 77, summary: 'Descripción' },
      ctx(client),
    );

    expect(seen.summary).toBe('Descripción');
    expect(seen.summaryformat).toBe(1);
  });

  it('rejects input when no field is provided', () => {
    expect(() =>
      actualizarSeccionTool.inputSchema.parse({ course_id: 42, section_id: 77 }),
    ).toThrow();
  });
});

// ---------- ocultar / liberar ----------

describe('ocultar_seccion / liberar_seccion', () => {
  it('ocultar sends visible=0', async () => {
    let seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_wsmanagesections_update_sections: (params) => {
        seen = (params.sections as Array<Record<string, unknown>>)[0]!;
        return [];
      },
    });

    await ocultarSeccionTool.handler({ course_id: 42, section_id: 77 }, ctx(client));

    expect(seen).toEqual({ type: 'id', section: 77, visible: 0 });
  });

  it('liberar sends visible=1', async () => {
    let seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_wsmanagesections_update_sections: (params) => {
        seen = (params.sections as Array<Record<string, unknown>>)[0]!;
        return [];
      },
    });

    await liberarSeccionTool.handler({ course_id: 42, section_id: 77 }, ctx(client));

    expect(seen).toEqual({ type: 'id', section: 77, visible: 1 });
  });

  it('surfaces error as toolResponse when WS throws', async () => {
    const logger = { ...nullLogger, warn: vi.fn() };
    const client = scriptedClient({
      local_wsmanagesections_update_sections: () => {
        throw new Error('permission denied');
      },
    });

    const result = await ocultarSeccionTool.handler(
      { course_id: 42, section_id: 77 },
      { client, logger },
    );

    expect(result.isError).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'ocultar_seccion.failed',
      expect.objectContaining({ section_id: 77 }),
    );
  });
});
