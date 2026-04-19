import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { obtenerContextoCursoTool } from '../../src/tools/obtener_contexto_curso.js';
import { publicarFichaClaseTool, extractComponentBodies } from '../../src/tools/publicar_ficha_clase.js';
import { publicarPreviewTool } from '../../src/tools/publicar_preview.js';
import { confirmarPreviewTool } from '../../src/tools/confirmar_preview.js';
import { nullLogger } from '../../src/utils/logger.js';
import type { MoodleClient } from '../../src/client/moodle-client.js';
import type { ToolContext } from '../../src/tools/types.js';
import { buildIdnumber, buildSectionIdnumber } from '../../src/utils/idempotency.js';

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

function ctx(client: MoodleClient): ToolContext {
  return { client, logger: nullLogger };
}

// ---------- extractComponentBodies ----------

describe('extractComponentBodies', () => {
  it('splits markdown by {#id} anchors', () => {
    const md = `
Preamble

## Apertura (10 min) {#apertura}
Saludo inicial.

## Cierre (5 min) {#cierre}
Despedida.
`;
    const out = extractComponentBodies(md);
    expect(Object.keys(out)).toEqual(['apertura', 'cierre']);
    expect(out.apertura).toContain('Saludo inicial');
    expect(out.cierre).toContain('Despedida');
  });

  it('returns empty object when no anchors', () => {
    expect(extractComponentBodies('just plain markdown')).toEqual({});
  });

  it('handles trailing content after last anchor', () => {
    const md = `## Title {#only}\nBody text`;
    expect(extractComponentBodies(md).only).toBe('Body text');
  });
});

// ---------- obtener_contexto_curso ----------

describe('obtenerContextoCursoTool', () => {
  const fichaId = 'italiano-a1-2026-u3-c5';
  const mcpIdnumber = buildIdnumber(fichaId, 'apertura');

  it('returns a full context snapshot', async () => {
    const client = scriptedClient({
      core_course_get_courses_by_field: () => ({
        courses: [
          {
            id: 42,
            fullname: 'Italiano A1',
            shortname: 'ITA-A1',
            format: 'topics',
            startdate: 1700000000,
            visible: 1,
          },
        ],
      }),
      core_course_get_contents: () => [
        {
          id: 100,
          name: 'General',
          section: 0,
          visible: 1,
          modules: [
            { id: 1, name: 'Welcome', modname: 'page', instance: 1, visible: 1 },
            { id: 2, name: 'Ficha 5', modname: 'page', instance: 2, visible: 0, idnumber: mcpIdnumber },
          ],
        },
      ],
      core_enrol_get_enrolled_users: () => [
        { id: 1, fullname: 'Alicia', roles: [{ roleid: 3, shortname: 'editingteacher' }] },
        { id: 2, fullname: 'Student A', roles: [{ roleid: 5, shortname: 'student' }] },
        { id: 3, fullname: 'Student B', roles: [] },
      ],
    });
    const res = await obtenerContextoCursoTool.handler(
      { course_id: 42, incluir_ultimas_clases: 5 },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.course.id).toBe(42);
    expect(data.secciones).toHaveLength(1);
    expect(data.secciones[0].modules_count).toBe(2);
    expect(data.ultimas_clases).toHaveLength(1);
    expect(data.ultimas_clases[0].ficha_idnumber).toBe(mcpIdnumber);
    expect(data.matriculados).toEqual({ total: 3, docentes: 1, alumnos: 2 });
  });

  it('surfaces an error if the course does not exist', async () => {
    const client = scriptedClient({
      core_course_get_courses_by_field: () => ({ courses: [] }),
      core_course_get_contents: () => [],
      core_enrol_get_enrolled_users: () => [],
    });
    const res = await obtenerContextoCursoTool.handler(
      { course_id: 999, incluir_ultimas_clases: 5 },
      ctx(client),
    );
    expect(res.isError).toBe(true);
    expect(res.meta).toMatchObject({ code: 'MOODLE_WS_COURSE_NOT_FOUND' });
  });
});

// ---------- publicar_ficha_clase ----------

describe('publicarFichaClaseTool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moodle-mcp-test-'));
  const fichaPath = join(dir, 'ficha.md');

  const fichaYaml = `---
id: italiano-a1-2026-u3-c5
tipo: clase
idioma: italiano
programa: italiano-a1-2026
unidad: 3
orden: 5
duracion_min: 90
modalidad: virtual
perfil_alumno: adulto
objetivos_observables:
  - o1
componentes:
  - { id: apertura, tipo: texto, minutos: 10 }
  - { id: cierre, tipo: texto, minutos: 5 }
moodle:
  course_id: 42
---

## Apertura {#apertura}
Saludo.

## Cierre {#cierre}
Despedida.
`;

  writeFileSync(fichaPath, fichaYaml, 'utf8');

  afterAll();
  function afterAll() {
    // vitest-like teardown via process hook
    process.once('exit', () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });
  }

  const sectionIdnumber = buildSectionIdnumber('italiano-a1-2026-u3-c5');
  const aperturaIdnumber = buildIdnumber('italiano-a1-2026-u3-c5', 'apertura');

  it('rejects non-absolute ficha_path', async () => {
    expect(() =>
      publicarFichaClaseTool.inputSchema.parse({
        ficha_path: './rel.md',
        course_id: 42,
      }),
    ).toThrow(/absolute/);
  });

  it('reads the ficha, plans, and updates visibility of existing modules', async () => {
    const editCalls = vi.fn(async () => null);
    const client = scriptedClient({
      core_course_get_contents: () => [
        {
          id: 200,
          name: 'Clase 5',
          section: 5,
          visible: 0,
          modules: [
            { id: 501, name: 'Apertura', modname: 'page', instance: 1, idnumber: aperturaIdnumber, visible: 0 },
            // cierre module is missing — should produce an advertencia
          ],
        },
      ],
      local_wsmanagesections_update_sections: editCalls,
    });
    const res = await publicarFichaClaseTool.handler(
      { ficha_path: fichaPath, course_id: 42, modo: 'oculto' },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.status).toBe('updated');
    expect(data.seccion.idnumber).toBe(sectionIdnumber);
    expect(data.recursos).toHaveLength(2);
    const apertura = data.recursos.find((r: { component_id: string }) => r.component_id === 'apertura');
    expect(apertura.status).toBe('updated_visibility');
    expect(apertura.moodle_id).toBe(501);
    const cierre = data.recursos.find((r: { component_id: string }) => r.component_id === 'cierre');
    expect(cierre.status).toBe('missing');
    expect(data.advertencias.some((a: string) => a.includes('cierre'))).toBe(true);
  });

  it('respects explicit section_id override', async () => {
    const client = scriptedClient({
      core_course_get_contents: () => [
        { id: 300, name: 'Target', section: 3, visible: 1, modules: [] },
        { id: 301, name: 'Other', section: 4, visible: 1, modules: [] },
      ],
      local_wsmanagesections_update_sections: async () => null,
    });
    const res = await publicarFichaClaseTool.handler(
      { ficha_path: fichaPath, course_id: 42, section_id: 300, modo: 'visible' },
      ctx(client),
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.seccion.id).toBe(300);
  });
});

// ---------- publicar_preview ----------

describe('publicarPreviewTool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moodle-mcp-test-preview-'));
  const fichaPath = join(dir, 'ficha.md');
  writeFileSync(
    fichaPath,
    `---
id: test-ficha
tipo: clase
idioma: italiano
programa: test
unidad: 1
orden: 1
duracion_min: 60
modalidad: virtual
perfil_alumno: adulto
objetivos_observables:
  - o1
componentes:
  - { id: x, tipo: texto, minutos: 5 }
moodle:
  course_id: 7
---

## X {#x}
content
`,
    'utf8',
  );
  process.once('exit', () => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {/**/}
  });

  it('publishes hidden and appends preview_url', async () => {
    const client = scriptedClient(
      {
        core_course_get_contents: () => [
          { id: 400, name: 'Home', section: 0, visible: 1, modules: [] },
        ],
        local_wsmanagesections_update_sections: async () => null,
      },
      'https://aula.italicia.com',
    );
    const res = await publicarPreviewTool.handler(
      { ficha_path: fichaPath, course_id: 7 },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.preview_url).toBe(
      'https://aula.italicia.com/course/view.php?id=7#section-400',
    );
  });
});

// ---------- confirmar_preview ----------

describe('confirmarPreviewTool', () => {
  it('updates the section visibility via local_wsmanagesections', async () => {
    const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
    const client = scriptedClient({
      local_wsmanagesections_update_sections: (params) => {
        calls.push({ fn: 'local_wsmanagesections_update_sections', params });
        return null;
      },
    });
    const res = await confirmarPreviewTool.handler(
      { seccion_id: 500, course_id: 42 },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.seccion).toEqual({ id: 500, ahora_visible: true });
    expect(data.recursos_liberados).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toMatchObject({
      courseid: 42,
      sections: [{ type: 'id', section: 500, visible: 1 }],
    });
  });

  it('ignores recursos_ids with an advertencia but still propagates visibility', async () => {
    const client = scriptedClient({
      local_wsmanagesections_update_sections: () => null,
    });
    const res = await confirmarPreviewTool.handler(
      { seccion_id: 500, course_id: 42, recursos_ids: [1, 2, 3] },
      ctx(client),
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.recursos_liberados).toBe(3);
    expect(data.advertencias).toHaveLength(1);
    expect(data.advertencias[0]).toMatch(/section level/i);
  });

  it('rejects invalid input', () => {
    expect(() =>
      confirmarPreviewTool.inputSchema.parse({ seccion_id: 0, course_id: 1 }),
    ).toThrow();
    expect(() =>
      confirmarPreviewTool.inputSchema.parse({ seccion_id: 1 }),
    ).toThrow();
  });
});
