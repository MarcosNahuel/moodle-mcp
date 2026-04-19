import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from './types.js';
import { FichaClaseSchema, type Componente } from '../schemas/ficha-clase.js';
import {
  CourseContentsResponseSchema,
  type Section,
  type Module,
} from '../schemas/moodle-responses.js';
import { planFichaClase, type Plan } from '../adapters/ficha-to-moodle.js';
import { MoodleWsError } from '../client/errors.js';
import { renderMarkdown } from '../utils/markdown-to-html.js';
import { resolveStyle, wrapWithStyle } from '../utils/estilo-presets.js';

const InputSchema = z
  .object({
    ficha_path: z
      .string()
      .min(1)
      .refine((p) => isAbsolute(p), {
        message: 'ficha_path must be an absolute path',
      }),
    course_id: z.number().int().positive(),
    section_id: z.number().int().positive().optional(),
    modo: z.enum(['visible', 'oculto']).default('oculto'),
  })
  .strict();

export type PublicarFichaClaseInput = z.infer<typeof InputSchema>;

/**
 * Publish a FichaClase markdown file as a Moodle course section plus its
 * component modules. Default mode is `oculto` (hidden/preview) so Alicia
 * can review before releasing to students (CONTEXT §1.2, §16).
 *
 * v0.1 scope: section upsert by idnumber + module visibility updates for
 * modules that already exist (identified by `idnumber` starting with
 * `mcp:`). Creating brand-new modules via WS requires a Moodle plugin
 * (`local_wsmanagesections` or an equivalent); when a referenced module
 * does not exist, we surface an `advertencia` asking the operator to seed
 * the first version manually or install the plugin. This contract is
 * honest about the capability boundary and lets integration tests drive
 * out the real endpoint wiring later.
 */
export function buildPublicarFichaClaseTool(): ToolDefinition<PublicarFichaClaseInput> {
  return {
    name: 'publicar_ficha_clase',
    description:
      'Publish a FichaClase markdown file as a Moodle section with component modules. Idempotent: republishing the same Ficha updates in place, never duplicates. Default modo is `oculto` (hidden). Use `publicar_preview` + `confirmar_preview` for the preview workflow.',
    inputSchema: InputSchema,
    handler: (args, ctx) => executePublicarFichaClase(args, ctx),
  };
}

export const publicarFichaClaseTool = buildPublicarFichaClaseTool();

async function executePublicarFichaClase(
  args: PublicarFichaClaseInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const raw = await readFile(args.ficha_path, 'utf8');
    const parsed = matter(raw);
    const ficha = FichaClaseSchema.parse(parsed.data);

    const componentContent = extractComponentBodies(parsed.content);
    const visible = args.modo === 'visible';
    const plan = planFichaClase({ ficha, visible, componentContent });

    const componentsById = new Map<string, Componente>(
      ficha.componentes.map((c) => [c.id, c]),
    );
    const result = await executePlan(
      ctx,
      plan,
      {
        courseId: args.course_id,
        sectionIdOverride: args.section_id,
        fichaDir: dirname(args.ficha_path),
      },
      componentsById,
    );

    return toJsonResponse(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Extract per-component markdown bodies from a Ficha body using
 * `{#component_id}` anchors on headings. A component body runs from just
 * after its anchor line to just before the next anchor line (or EOF).
 */
export function extractComponentBodies(body: string): Record<string, string> {
  const anchorRe = /^\s{0,3}#{1,6}\s+[^\n]*\{#([A-Za-z0-9_-]+)\}\s*$/gm;
  const matches = [...body.matchAll(anchorRe)];
  const result: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const start = (cur.index ?? 0) + cur[0].length;
    const end = next?.index ?? body.length;
    const id = cur[1];
    if (id !== undefined) {
      result[id] = body.slice(start, end).trim();
    }
  }
  return result;
}

interface ExecuteContext {
  courseId: number;
  sectionIdOverride: number | undefined;
  fichaDir: string;
}

interface ExecuteResult {
  status: 'created' | 'updated';
  seccion: {
    id: number;
    name: string;
    url: string;
    idnumber: string;
    sectionnum: number;
  };
  recursos: Array<{
    component_id: string;
    moodle_id: number | null;
    tipo: string;
    url: string | null;
    idnumber: string;
    status: 'created' | 'updated' | 'skipped' | 'missing';
  }>;
  advertencias: string[];
}

async function executePlan(
  ctx: ToolContext,
  plan: Plan,
  exec: ExecuteContext,
  componentsById: Map<string, Componente>,
): Promise<ExecuteResult> {
  const advertencias: string[] = [];

  const contentsRaw = await ctx.client.call('core_course_get_contents', {
    courseid: exec.courseId,
  });
  const contents = CourseContentsResponseSchema.parse(contentsRaw);

  const { section, status } = await ensureSection(ctx, {
    contents,
    plan,
    exec,
    advertencias,
  });

  const uploadOps = plan.operations.filter((o) => o.kind === 'upload_asset');
  for (const up of uploadOps) {
    if (up.kind !== 'upload_asset') continue;
    advertencias.push(
      `Asset upload for '${up.asset_id}' (${up.asset_tipo}) planned but not executed — multipart upload is v0.4 work. ` +
        `Seed '${up.asset_path}' manually or embed a public URL in the markdown.`,
    );
  }

  const recursos: ExecuteResult['recursos'] = [];
  const moduleIndex = indexModulesByIdnumber(contents);

  for (const op of plan.operations) {
    if (op.kind === 'upload_asset') continue;

    if (op.kind === 'upsert_page') {
      const result = await upsertPageOp(ctx, op, {
        courseId: exec.courseId,
        sectionnum: section.sectionnum,
        componente: componentsById.get(op.component_id),
      });
      recursos.push(result);
      continue;
    }

    // Other module kinds (assignment, url) still fall through to v0.1.x
    // "missing" reporting until the companion plugin exposes create for
    // those types. Visibility-only update path kept for pre-existing modules.
    const existing = moduleIndex.get(op.idnumber);
    if (!existing) {
      advertencias.push(
        `Module '${op.component_id}' (kind=${op.kind}, idnumber ${op.idnumber}) does not exist yet. ` +
          `v0.3 only auto-creates mod_page. Create ${op.kind} modules manually or wait for v0.4.`,
      );
      recursos.push({
        component_id: op.component_id,
        moodle_id: null,
        tipo: moduleTypeFromOp(op.kind),
        url: null,
        idnumber: op.idnumber,
        status: 'missing',
      });
      continue;
    }
    recursos.push({
      component_id: op.component_id,
      moodle_id: existing.id,
      tipo: existing.modname,
      url: existing.url ?? null,
      idnumber: op.idnumber,
      status: 'skipped',
    });
  }

  return {
    status,
    seccion: section,
    recursos,
    advertencias,
  };
}

async function upsertPageOp(
  ctx: ToolContext,
  op: Plan['operations'][number] & { kind: 'upsert_page' },
  scope: {
    courseId: number;
    sectionnum: number;
    componente: Componente | undefined;
  },
): Promise<ExecuteResult['recursos'][number]> {
  const markdown = op.content_markdown;
  const rawHtml = markdown.trim() === '' ? '' : renderMarkdown(markdown);
  const style = resolveStyle({
    tipo: scope.componente?.tipo ?? 'default',
    ...(scope.componente?.estilo !== undefined ? { estilo: scope.componente.estilo } : {}),
    ...(scope.componente?.custom_style !== undefined
      ? { customStyle: scope.componente.custom_style }
      : {}),
  });
  const styledHtml = rawHtml === '' ? '' : wrapWithStyle(rawHtml, style);

  try {
    const result = (await ctx.client.call('local_italiciamcp_upsert_page', {
      courseid: scope.courseId,
      sectionnum: scope.sectionnum,
      idnumber: op.idnumber,
      name: op.name,
      intro: '',
      content: styledHtml,
      visible: op.visible ? 1 : 0,
    })) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };

    return {
      component_id: op.component_id,
      moodle_id: result.cmid,
      tipo: 'page',
      url: result.url,
      idnumber: op.idnumber,
      status: result.action,
    };
  } catch (e) {
    ctx.logger.warn('upsert_page.failed', {
      idnumber: op.idnumber,
      error: (e as Error).message,
    });
    return {
      component_id: op.component_id,
      moodle_id: null,
      tipo: 'page',
      url: null,
      idnumber: op.idnumber,
      status: 'missing',
    };
  }
}

function indexModulesByIdnumber(contents: Section[]): Map<string, Module> {
  const map = new Map<string, Module>();
  for (const s of contents) {
    for (const m of s.modules) {
      if (m.idnumber) map.set(m.idnumber, m);
    }
  }
  return map;
}

function moduleTypeFromOp(kind: Exclude<Plan['operations'][number]['kind'], 'upload_asset'>): string {
  switch (kind) {
    case 'upsert_page':
      return 'page';
    case 'upsert_assignment':
      return 'assign';
    case 'upsert_url':
      return 'url';
  }
}

interface EnsureSectionArgs {
  contents: Section[];
  plan: Plan;
  exec: ExecuteContext;
  advertencias: string[];
}

async function ensureSection(
  ctx: ToolContext,
  { contents, plan, exec, advertencias }: EnsureSectionArgs,
): Promise<{
  section: ExecuteResult['seccion'];
  status: 'created' | 'updated';
}> {
  // 1. Explicit override wins (caller asked for a specific section).
  if (exec.sectionIdOverride !== undefined) {
    const target = contents.find((s) => s.id === exec.sectionIdOverride);
    if (!target) {
      throw new MoodleWsError(
        `section_id ${exec.sectionIdOverride} not found in course ${exec.courseId}`,
        {
          code: 'MOODLE_WS_SECTION_NOT_FOUND',
          details: { course_id: exec.courseId, section_id: exec.sectionIdOverride },
        },
      );
    }
    await setSectionVisibility(ctx, target.id, exec.courseId, plan.section.visible);
    return {
      section: sectionDescriptor(target, plan.section.idnumber),
      status: 'updated',
    };
  }

  // 2. Look up existing section by any of the planned module idnumbers.
  // Moodle sections do not expose their own `idnumber` in the core WS
  // response, so we identify "our" section indirectly: the section that
  // already contains at least one module that belongs to this Ficha.
  const plannedModuleIdnumbers = new Set(
    plan.operations
      .filter((o) => o.kind !== 'upload_asset')
      .map((o) => o.idnumber),
  );
  const existing = contents.find((s) =>
    s.modules.some(
      (m) => m.idnumber !== undefined && plannedModuleIdnumbers.has(m.idnumber),
    ),
  );
  if (existing) {
    await setSectionVisibility(ctx, existing.id, exec.courseId, plan.section.visible);
    return {
      section: sectionDescriptor(existing, plan.section.idnumber),
      status: 'updated',
    };
  }

  // 3. Section does not exist — try to create a new one via
  // `local_wsmanagesections_create_sections`. If the plugin is not
  // available or the call fails, fall back to the preferred / general
  // section with an advertencia so publish still completes.
  try {
    const created = (await ctx.client.call(
      'local_wsmanagesections_create_sections',
      {
        courseid: exec.courseId,
        position: 0, // append at end
        number: 1,
      },
    )) as Array<{ sectionid: number; sectionnumber: number }> | undefined;

    const newSectionInfo = Array.isArray(created) ? created[0] : undefined;
    if (newSectionInfo?.sectionid) {
      // Give the new section a meaningful name via update_sections.
      await ctx.client.call('local_wsmanagesections_update_sections', {
        courseid: exec.courseId,
        sections: [
          {
            type: 'id',
            section: newSectionInfo.sectionid,
            name: plan.section.name,
            visible: plan.section.visible ? 1 : 0,
          },
        ],
      });

      return {
        section: {
          id: newSectionInfo.sectionid,
          name: plan.section.name,
          url: '',
          idnumber: plan.section.idnumber,
          sectionnum: newSectionInfo.sectionnumber ?? 0,
        },
        status: 'created',
      };
    }
  } catch (e) {
    advertencias.push(
      `Could not auto-create section '${plan.section.name}': ${(e as Error).message}. ` +
        `Falling back to General section.`,
    );
  }

  // 4. Fallback: use preferred_section_id or section 0 (course General).
  const fallback =
    (plan.section.preferred_section_id !== null
      ? contents.find((s) => s.id === plan.section.preferred_section_id)
      : undefined) ?? contents[0];
  if (!fallback) {
    throw new MoodleWsError(
      `Course ${exec.courseId} has no sections — cannot place Ficha`,
      {
        code: 'MOODLE_WS_NO_SECTIONS',
        details: { course_id: exec.courseId },
      },
    );
  }
  advertencias.push(
    `Section '${plan.section.name}' (idnumber ${plan.section.idnumber}) did not exist and auto-create failed; ` +
      `publishing into '${fallback.name}' (section ${fallback.section ?? '?'}) as fallback.`,
  );
  await setSectionVisibility(ctx, fallback.id, exec.courseId, plan.section.visible);
  return {
    section: sectionDescriptor(fallback, plan.section.idnumber),
    status: 'created',
  };
}

async function setSectionVisibility(
  ctx: ToolContext,
  sectionId: number,
  courseId: number,
  visible: boolean,
): Promise<void> {
  try {
    await ctx.client.call('local_wsmanagesections_update_sections', {
      courseid: courseId,
      sections: [
        {
          type: 'id',
          section: sectionId,
          visible: visible ? 1 : 0,
        },
      ],
    });
  } catch (e) {
    ctx.logger.warn('update_section.failed', {
      section_id: sectionId,
      course_id: courseId,
      error: (e as Error).message,
    });
    // Non-fatal — sections may already be in the desired state, or the
    // plugin may not be installed. The publish flow carries on.
  }
}

function sectionDescriptor(s: Section, plannedIdnumber: string) {
  return {
    id: s.id,
    name: s.name,
    url: '',
    idnumber: plannedIdnumber,
    sectionnum: s.section ?? 0,
  };
}
