import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { publicarFichaClaseTool } from '../../src/tools/contenido/publicar_ficha_clase.js';
import { publicarPreviewTool } from '../../src/tools/contenido/publicar_preview.js';
import { confirmarPreviewTool } from '../../src/tools/contenido/confirmar_preview.js';
import { obtenerContextoCursoTool } from '../../src/tools/curso/obtener_contexto_curso.js';
import { nullLogger } from '../../src/utils/logger.js';
import type { MoodleClient } from '../../src/client/moodle-client.js';
import {
  readSandboxEnv,
  probeSandbox,
  buildSandboxClient,
} from './sandbox-setup.js';

/**
 * End-to-end integration tests against a real (docker) Moodle instance.
 *
 * These are skipped unless `MOODLE_TEST_TOKEN` is set. CI runs them after
 * bringing up the docker-compose stack (see
 * `docker-compose.test.yml`). Developers running locally typically do:
 *
 *   docker compose -f tests/integration/docker-compose.test.yml up -d
 *   export MOODLE_TEST_URL=http://localhost:8081
 *   export MOODLE_TEST_TOKEN=<token>
 *   export MOODLE_TEST_COURSE=2
 *   npm run test:integration
 *
 * The suite is also honest about v0.1 limits: it exercises the parts of
 * the pipeline that exist (section lookup + module visibility + idempotent
 * republish) and documents what is TODO for v0.2 (module creation via
 * `local_wsmanagesections`).
 */

const env = readSandboxEnv();
const itif = env ? it : it.skip;

const fixturePath = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'ficha-clase-ejemplo.md',
);

describe('moodle-mcp integration against docker Moodle', () => {
  let client: MoodleClient;
  let courseId = 0;

  beforeAll(async () => {
    if (!env) return;
    const info = await probeSandbox(env);
    if (!info) {
      throw new Error(
        'MOODLE_TEST_TOKEN is set but Moodle at MOODLE_TEST_URL is not reachable or the token is invalid. ' +
          'Start the docker sandbox and generate a token (see sandbox-setup.ts).',
      );
    }
    client = buildSandboxClient(env);
    courseId = env.courseId ?? 2; // caller should export MOODLE_TEST_COURSE to a real course
  });

  itif('obtener_contexto_curso returns a realistic snapshot', async () => {
    const res = await obtenerContextoCursoTool.handler(
      { course_id: courseId, incluir_ultimas_clases: 5 },
      { client, logger: nullLogger },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.course.id).toBe(courseId);
    expect(typeof data.matriculados.total).toBe('number');
  });

  itif('publicar_ficha_clase is idempotent', async () => {
    const first = await publicarFichaClaseTool.handler(
      { ficha_path: fixturePath, course_id: courseId, modo: 'oculto' },
      { client, logger: nullLogger },
    );
    const second = await publicarFichaClaseTool.handler(
      { ficha_path: fixturePath, course_id: courseId, modo: 'oculto' },
      { client, logger: nullLogger },
    );
    expect(first.isError).toBeFalsy();
    expect(second.isError).toBeFalsy();
    const d1 = JSON.parse(first.content[0]!.text);
    const d2 = JSON.parse(second.content[0]!.text);
    // Idempotency: the section the run targets is the same on both calls.
    expect(d2.seccion.id).toBe(d1.seccion.id);
    // Every recurso with moodle_id in the 2nd run matches the 1st run.
    const firstById = new Map<string, number | null>(
      d1.recursos.map((r: { component_id: string; moodle_id: number | null }) => [
        r.component_id,
        r.moodle_id,
      ]),
    );
    for (const r of d2.recursos) {
      if (r.moodle_id !== null) {
        expect(firstById.get(r.component_id)).toBe(r.moodle_id);
      }
    }
  });

  itif('publicar_preview then confirmar_preview toggles visibility', async () => {
    const prev = await publicarPreviewTool.handler(
      { ficha_path: fixturePath, course_id: courseId },
      { client, logger: nullLogger },
    );
    expect(prev.isError).toBeFalsy();
    const prevData = JSON.parse(prev.content[0]!.text);
    expect(typeof prevData.preview_url).toBe('string');

    const confirmed = await confirmarPreviewTool.handler(
      {
        seccion_id: prevData.seccion.id,
        recursos_ids: prevData.recursos
          .filter((r: { moodle_id: number | null }) => r.moodle_id !== null)
          .map((r: { moodle_id: number }) => r.moodle_id),
      },
      { client, logger: nullLogger },
    );
    expect(confirmed.isError).toBeFalsy();
    const confirmedData = JSON.parse(confirmed.content[0]!.text);
    expect(confirmedData.seccion.ahora_visible).toBe(true);
  });
});
