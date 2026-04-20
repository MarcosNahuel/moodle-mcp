import { describe, it, expect, vi } from 'vitest';
import { listarAlumnosTool } from '../../../src/tools/alumnos/listar_alumnos.js';
import { matricularCsvTool } from '../../../src/tools/alumnos/matricular_csv.js';
import { darBajaTool } from '../../../src/tools/alumnos/dar_baja.js';
import { crearGrupoTool, asignarAGrupoTool } from '../../../src/tools/alumnos/grupos.js';
import { cambiarRolTool } from '../../../src/tools/alumnos/cambiar_rol.js';
import { resetPasswordTool } from '../../../src/tools/alumnos/reset_password.js';
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

// ---------- listar_alumnos ----------

describe('listar_alumnos', () => {
  it('filters by role=student by default', async () => {
    const client = scriptedClient({
      core_enrol_get_enrolled_users: () => [
        { id: 1, fullname: 'S1', roles: [{ roleid: 5, shortname: 'student', name: 'Student' }] },
        { id: 2, fullname: 'T1', roles: [{ roleid: 3, shortname: 'editingteacher', name: 'Teacher' }] },
      ],
    });

    const result = await listarAlumnosTool.handler(
      { course_id: 5, role: 'student', limit: 200 },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.users).toHaveLength(1);
    expect(p.users[0].user_id).toBe(1);
  });

  it('with role=any returns everyone', async () => {
    const client = scriptedClient({
      core_enrol_get_enrolled_users: () => [
        { id: 1, fullname: 'S1', roles: [{ roleid: 5, shortname: 'student', name: 'Student' }] },
        { id: 2, fullname: 'T1', roles: [{ roleid: 3, shortname: 'editingteacher', name: 'T' }] },
      ],
    });

    const result = await listarAlumnosTool.handler(
      { course_id: 5, role: 'any', limit: 200 },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.users).toHaveLength(2);
  });
});

// ---------- matricular_csv ----------

describe('matricular_csv', () => {
  it('creates missing user with temp password then enrols', async () => {
    const calls: string[] = [];
    const client = scriptedClient({
      core_user_get_users_by_field: () => [],
      core_user_create_users: () => {
        calls.push('create');
        return [{ id: 999, username: 'juan' }];
      },
      enrol_manual_enrol_users: () => {
        calls.push('enrol');
        return null;
      },
    });

    const csv = 'email,firstname,lastname\njuan@x.com,Juan,Pérez';
    const result = await matricularCsvTool.handler(
      {
        course_id: 5,
        csv_content: csv,
        create_users_if_missing: true,
        default_role_shortname: 'student',
      },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.total_rows).toBe(1);
    expect(p.created_and_enrolled).toBe(1);
    expect(p.results[0].user_id).toBe(999);
    expect(typeof p.results[0].temp_password).toBe('string');
    expect(p.results[0].temp_password.length).toBeGreaterThanOrEqual(16);
    expect(calls).toEqual(['create', 'enrol']);
  });

  it('skips missing user when create_users_if_missing=false', async () => {
    const client = scriptedClient({
      core_user_get_users_by_field: () => [],
    });

    const result = await matricularCsvTool.handler(
      {
        course_id: 5,
        csv_content: 'email,firstname,lastname\njuan@x.com,J,P',
        create_users_if_missing: false,
        default_role_shortname: 'student',
      },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.skipped).toBe(1);
    expect(p.results[0].status).toBe('skipped_missing_user');
  });

  it('enrols existing user without creating', async () => {
    const calls: string[] = [];
    const client = scriptedClient({
      core_user_get_users_by_field: () => [{ id: 42 }],
      enrol_manual_enrol_users: () => {
        calls.push('enrol');
        return null;
      },
    });

    const result = await matricularCsvTool.handler(
      {
        course_id: 5,
        csv_content: 'email,firstname,lastname\njuan@x.com,J,P',
        create_users_if_missing: true,
        default_role_shortname: 'student',
      },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.enrolled).toBe(1);
    expect(p.created_and_enrolled).toBe(0);
    expect(p.results[0].user_id).toBe(42);
    expect(p.results[0].temp_password).toBeUndefined();
    expect(calls).toEqual(['enrol']);
  });

  it('reports header errors', async () => {
    const client = scriptedClient({});
    const result = await matricularCsvTool.handler(
      {
        course_id: 5,
        csv_content: 'wrong,headers\nfoo,bar',
        create_users_if_missing: true,
        default_role_shortname: 'student',
      },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.parse_errors.length).toBeGreaterThan(0);
  });
});

// ---------- dar_baja ----------

describe('dar_baja', () => {
  it('sends batched unenrol payload', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      enrol_manual_unenrol_users: (params) => {
        sent = params;
        return null;
      },
    });

    await darBajaTool.handler(
      { course_id: 5, user_ids: [10, 20, 30] },
      ctx(client),
    );

    const enrolments = sent.enrolments as Array<Record<string, unknown>>;
    expect(enrolments).toHaveLength(3);
    expect(enrolments[0]).toEqual({ userid: 10, courseid: 5 });
  });
});

// ---------- crear_grupo + asignar_a_grupo ----------

describe('crear_grupo', () => {
  it('creates a group and returns id/name', async () => {
    const client = scriptedClient({
      core_group_create_groups: () => [{ id: 77, name: 'Grupo A' }],
    });

    const result = await crearGrupoTool.handler(
      { course_id: 5, name: 'Grupo A', description: '', idnumber: '' },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.group_id).toBe(77);
  });
});

describe('asignar_a_grupo', () => {
  it('adds members via core_group_add_group_members', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_group_add_group_members: (params) => {
        sent = params;
        return null;
      },
    });

    await asignarAGrupoTool.handler(
      { group_id: 77, user_ids: [1, 2, 3] },
      ctx(client),
    );

    const members = sent.members as Array<Record<string, unknown>>;
    expect(members).toHaveLength(3);
    expect(members[0]).toEqual({ groupid: 77, userid: 1 });
  });
});

// ---------- cambiar_rol ----------

describe('cambiar_rol', () => {
  it('assigns course-level role via core_role_assign_roles', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_course_get_courses_by_field: () => ({ courses: [{ id: 5 }] }),
      core_role_assign_roles: (params) => {
        sent = params;
        return null;
      },
    });

    await cambiarRolTool.handler(
      { course_id: 5, user_id: 100, new_role: 'editingteacher', context_level: 'course' },
      ctx(client),
    );

    const a = (sent.assignments as Array<Record<string, unknown>>)[0]!;
    expect(a).toEqual({
      roleid: 3,
      userid: 100,
      contextlevel: 'course',
      instanceid: 5,
    });
  });
});

// ---------- reset_password ----------

describe('reset_password', () => {
  it('generates random password when none given', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_user_update_users: (params) => {
        sent = params;
        return null;
      },
    });

    const result = await resetPasswordTool.handler(
      { user_id: 100 },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.generated).toBe(true);
    expect(typeof p.password).toBe('string');
    expect(p.password.length).toBeGreaterThanOrEqual(16);

    const user = (sent.users as Array<Record<string, unknown>>)[0]!;
    expect(user.id).toBe(100);
    expect(typeof user.password).toBe('string');
  });

  it('uses provided password when given', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      core_user_update_users: (params) => {
        sent = params;
        return null;
      },
    });

    const result = await resetPasswordTool.handler(
      { user_id: 100, new_password: 'MiPass123!' },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.generated).toBe(false);
    expect(p.password).toBe('MiPass123!');
    const user = (sent.users as Array<Record<string, unknown>>)[0]!;
    expect(user.password).toBe('MiPass123!');
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(() =>
      resetPasswordTool.inputSchema.parse({ user_id: 1, new_password: 'short' }),
    ).toThrow();
  });

  it('surfaces errors and does not log the password', async () => {
    const logger = { ...nullLogger, warn: vi.fn() };
    const client = scriptedClient({
      core_user_update_users: () => {
        throw new Error('invalid user');
      },
    });

    const result = await resetPasswordTool.handler(
      { user_id: 999, new_password: 'MiPass123!' },
      { client, logger },
    );

    expect(result.isError).toBe(true);
    const logCall = logger.warn.mock.calls[0];
    expect(JSON.stringify(logCall)).not.toContain('MiPass123!');
  });
});
