import { describe, it, expect, vi } from 'vitest';
import { upsertAssignmentOp } from '../../../src/tools/contenido/publicar_ficha_clase.js';
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
  kind: 'upsert_assignment' as const,
  idnumber: 'mcp:module:a1b2c3d4',
  component_id: 'tarea-1',
  name: 'Tarea — grabá un audio presentándote',
  description_markdown: 'Grabá un **audio** de 30-60 segundos en italiano.',
  visible: false,
};

const scope = { courseId: 42, sectionnum: 3 };

describe('upsertAssignmentOp', () => {
  it('calls local_italiciamcp_upsert_assignment with expected params on create', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      local_italiciamcp_upsert_assignment: (params) => {
        calls.push({ fn: 'local_italiciamcp_upsert_assignment', params });
        return {
          action: 'created',
          cmid: 555,
          instanceid: 22,
          url: 'https://aula.example.com/mod/assign/view.php?id=555',
        };
      },
    });

    const result = await upsertAssignmentOp({ client, logger: nullLogger }, baseOp, scope);

    expect(calls).toHaveLength(1);
    const p = calls[0]!.params;
    expect(p.courseid).toBe(42);
    expect(p.sectionnum).toBe(3);
    expect(p.idnumber).toBe(baseOp.idnumber);
    expect(p.name).toBe(baseOp.name);
    // description_markdown is rendered to HTML before being sent as `intro`.
    expect(typeof p.intro).toBe('string');
    expect(p.intro as string).toContain('<strong>audio</strong>');
    // Defaults for v0.5 — future phases can expose these via Componente schema.
    expect(p.duedate).toBe(0);
    expect(p.allowsubmissionsfromdate).toBe(0);
    expect(p.cutoffdate).toBe(0);
    expect(p.grade).toBe(100);
    expect(p.visible).toBe(0);

    expect(result).toEqual({
      component_id: 'tarea-1',
      moodle_id: 555,
      tipo: 'assign',
      url: 'https://aula.example.com/mod/assign/view.php?id=555',
      idnumber: baseOp.idnumber,
      status: 'created',
    });
  });

  it('sends intro="" when description_markdown is empty', async () => {
    const seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_italiciamcp_upsert_assignment: (params) => {
        Object.assign(seen, params);
        return { action: 'created', cmid: 1, instanceid: 1, url: 'https://x' };
      },
    });

    await upsertAssignmentOp(
      { client, logger: nullLogger },
      { ...baseOp, description_markdown: '' },
      scope,
    );

    expect(seen.intro).toBe('');
  });

  it('passes visible=1 when op.visible is true', async () => {
    const seen: Record<string, unknown> = {};
    const client = scriptedClient({
      local_italiciamcp_upsert_assignment: (params) => {
        Object.assign(seen, params);
        return { action: 'updated', cmid: 2, instanceid: 2, url: 'https://x' };
      },
    });

    await upsertAssignmentOp(
      { client, logger: nullLogger },
      { ...baseOp, visible: true },
      scope,
    );

    expect(seen.visible).toBe(1);
  });

  it('returns status=missing and logs a warning when the WS call throws', async () => {
    const logger = { ...nullLogger, warn: vi.fn() };
    const client = scriptedClient({
      local_italiciamcp_upsert_assignment: () => {
        throw new Error('plugin v0.4.1 not installed');
      },
    });

    const result = await upsertAssignmentOp({ client, logger }, baseOp, scope);

    expect(result.status).toBe('missing');
    expect(result.moodle_id).toBeNull();
    expect(result.url).toBeNull();
    expect(result.tipo).toBe('assign');
    expect(logger.warn).toHaveBeenCalledWith(
      'upsert_assignment.failed',
      expect.objectContaining({
        idnumber: baseOp.idnumber,
        error: 'plugin v0.4.1 not installed',
      }),
    );
  });
});
