import { describe, it, expect, vi } from 'vitest';
import { crearCursoTool } from '../../../src/tools/curso/crear_curso.js';
import { actualizarCursoTool } from '../../../src/tools/curso/actualizar_curso.js';
import { duplicarCursoTool } from '../../../src/tools/curso/duplicar_curso.js';
import { archivarCursoTool } from '../../../src/tools/curso/archivar_curso.js';
import { listarMisCursosTool } from '../../../src/tools/curso/listar_mis_cursos.js';
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

// ---------- crear_curso ----------

describe('crear_curso', () => {
  it('creates when idnumber not taken, builds idnumber with mcp:course: prefix', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      core_course_get_courses_by_field: () => ({ courses: [] }),
      core_course_create_courses: (params) => {
        calls.push({ fn: 'create', params });
        return [{ id: 99, shortname: 'A2-2026' }];
      },
    });

    const result = await crearCursoTool.handler(
      {
        fullname: 'Italiano A2 2026',
        shortname: 'A2-2026',
        categoryid: 2,
        idnumber_slug: 'italiano-a2-2026',
        summary: '',
        format: 'topics',
        numsections: 10,
        visible: false,
        lang: '',
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]!.text;
    expect(text).toContain('"course_id":99');
    expect(text).toMatch(/"idnumber":"mcp:course:[a-f0-9]{20}"/);

    const sent = (calls[0]!.params as { courses: Array<Record<string, unknown>> }).courses[0]!;
    expect(sent.fullname).toBe('Italiano A2 2026');
    expect(sent.shortname).toBe('A2-2026');
    expect(sent.visible).toBe(0);
  });

  it('throws MOODLE_WS_COURSE_EXISTS when idnumber is taken', async () => {
    const client = scriptedClient({
      core_course_get_courses_by_field: () => ({
        courses: [{ id: 7, fullname: 'Italiano A2 2026' }],
      }),
    });

    const result = await crearCursoTool.handler(
      {
        fullname: 'X',
        shortname: 'X',
        categoryid: 1,
        idnumber_slug: 'italiano-a2-2026',
        summary: '',
        format: 'topics',
        numsections: 10,
        visible: false,
        lang: '',
      },
      ctx(client),
    );

    expect(result.isError).toBe(true);
    expect(result.meta?.code).toBe('MOODLE_WS_COURSE_EXISTS');
  });

  it('rejects invalid slug (uppercase, spaces, special chars)', () => {
    expect(() =>
      crearCursoTool.inputSchema.parse({
        fullname: 'x',
        shortname: 'x',
        idnumber_slug: 'Italiano A2 2026',
      }),
    ).toThrow();
  });
});

// ---------- actualizar_curso ----------

describe('actualizar_curso', () => {
  it('forwards only provided fields', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_course_update_courses: (params) => {
        sent = (params.courses as Array<Record<string, unknown>>)[0]!;
        return [];
      },
    });

    const result = await actualizarCursoTool.handler(
      { course_id: 5, fullname: 'Nuevo nombre' },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent).toEqual({ id: 5, fullname: 'Nuevo nombre' });
  });

  it('sends summaryformat=1 when summary is set', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_course_update_courses: (params) => {
        sent = (params.courses as Array<Record<string, unknown>>)[0]!;
        return [];
      },
    });

    await actualizarCursoTool.handler({ course_id: 5, summary: 'Nueva' }, ctx(client));

    expect(sent.summary).toBe('Nueva');
    expect(sent.summaryformat).toBe(1);
  });

  it('maps visible boolean to 1/0', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_course_update_courses: (params) => {
        sent = (params.courses as Array<Record<string, unknown>>)[0]!;
        return [];
      },
    });

    await actualizarCursoTool.handler({ course_id: 5, visible: true }, ctx(client));
    expect(sent.visible).toBe(1);
  });

  it('rejects empty update', () => {
    expect(() => actualizarCursoTool.inputSchema.parse({ course_id: 5 })).toThrow();
  });
});

// ---------- duplicar_curso ----------

describe('duplicar_curso', () => {
  it('calls duplicate_course with options array and then stamps new idnumber', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      core_course_duplicate_course: (params) => {
        calls.push({ fn: 'duplicate', params });
        return { id: 200, shortname: 'A2-2027', fullname: 'Italiano A2 2027' };
      },
      core_course_update_courses: (params) => {
        calls.push({ fn: 'update', params });
        return [];
      },
    });

    const result = await duplicarCursoTool.handler(
      {
        source_course_id: 5,
        new_fullname: 'Italiano A2 2027',
        new_shortname: 'A2-2027',
        new_idnumber_slug: 'italiano-a2-2027',
        categoryid: 1,
        visible: false,
        options: {
          users: false,
          role_assignments: false,
          activities: true,
          blocks: true,
          filters: true,
          comments: false,
          badges: false,
          calendarevents: false,
          userscompletion: false,
          logs: false,
          grade_histories: false,
        },
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('"new_course_id":200');

    expect(calls).toHaveLength(2);
    const dupParams = calls[0]!.params;
    expect(dupParams.courseid).toBe(5);
    expect(dupParams.fullname).toBe('Italiano A2 2027');
    const opts = dupParams.options as Array<Record<string, unknown>>;
    const activitiesOpt = opts.find((o) => o.name === 'activities');
    expect(activitiesOpt?.value).toBe(1);
    const usersOpt = opts.find((o) => o.name === 'users');
    expect(usersOpt?.value).toBe(0);

    const updateParams = calls[1]!.params;
    const courseUpdate = (updateParams.courses as Array<Record<string, unknown>>)[0]!;
    expect(courseUpdate.id).toBe(200);
    expect(typeof courseUpdate.idnumber).toBe('string');
    expect((courseUpdate.idnumber as string).startsWith('mcp:course:')).toBe(true);
  });
});

// ---------- archivar_curso ----------

describe('archivar_curso', () => {
  it('sends visible=0 by default (archive intent)', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_course_update_courses: (params) => {
        sent = (params.courses as Array<Record<string, unknown>>)[0]!;
        return [];
      },
    });

    await archivarCursoTool.handler({ course_id: 5, visible: false }, ctx(client));

    expect(sent).toEqual({ id: 5, visible: 0 });
  });

  it('sends visible=1 when asked to un-archive', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_course_update_courses: (params) => {
        sent = (params.courses as Array<Record<string, unknown>>)[0]!;
        return [];
      },
    });

    await archivarCursoTool.handler({ course_id: 5, visible: true }, ctx(client));

    expect(sent).toEqual({ id: 5, visible: 1 });
  });
});

// ---------- listar_mis_cursos ----------

describe('listar_mis_cursos', () => {
  it('returns enrolled courses sorted by startdate desc', async () => {
    const client = scriptedClient({
      core_enrol_get_users_courses: () => [
        { id: 1, fullname: 'Old', shortname: 'O', visible: 1, startdate: 1_000_000_000 },
        { id: 2, fullname: 'New', shortname: 'N', visible: 1, startdate: 2_000_000_000 },
      ],
    });

    const result = await listarMisCursosTool.handler(
      { userid: 10, only_visible: false, limit: 50 },
      ctx(client),
    );

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.courses[0].course_id).toBe(2);
    expect(payload.courses[1].course_id).toBe(1);
    expect(payload.total_enrolled).toBe(2);
  });

  it('filters hidden courses when only_visible=true', async () => {
    const client = scriptedClient({
      core_enrol_get_users_courses: () => [
        { id: 1, fullname: 'Vis', shortname: 'V', visible: 1, startdate: 1 },
        { id: 2, fullname: 'Hid', shortname: 'H', visible: 0, startdate: 2 },
      ],
    });

    const result = await listarMisCursosTool.handler(
      { userid: 10, only_visible: true, limit: 50 },
      ctx(client),
    );

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.courses.map((c: { course_id: number }) => c.course_id)).toEqual([1]);
  });

  it('respects limit', async () => {
    const client = scriptedClient({
      core_enrol_get_users_courses: () =>
        Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          fullname: `c${i}`,
          shortname: `c${i}`,
          visible: 1,
          startdate: i,
        })),
    });

    const result = await listarMisCursosTool.handler(
      { userid: 10, only_visible: false, limit: 3 },
      ctx(client),
    );

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.returned).toBe(3);
    expect(payload.total_enrolled).toBe(10);
  });

  it('surfaces WS errors', async () => {
    const logger = { ...nullLogger, warn: vi.fn() };
    const client = scriptedClient({
      core_enrol_get_users_courses: () => {
        throw new Error('invalid user');
      },
    });

    const result = await listarMisCursosTool.handler(
      { userid: 999, only_visible: false, limit: 50 },
      { client, logger },
    );

    expect(result.isError).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});
