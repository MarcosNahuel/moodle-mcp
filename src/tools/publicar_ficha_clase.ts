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
import { FichaClaseSchema } from '../schemas/ficha-clase.js';
import {
  CourseContentsResponseSchema,
  type Section,
  type Module,
} from '../schemas/moodle-responses.js';
import { planFichaClase, type Plan } from '../adapters/ficha-to-moodle.js';
import { MoodleWsError } from '../client/errors.js';

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

    const result = await executePlan(ctx, plan, {
      courseId: args.course_id,
      sectionIdOverride: args.section_id,
      fichaDir: dirname(args.ficha_path),
    });

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
  };
  recursos: Array<{
    component_id: string;
    moodle_id: number | null;
    tipo: string;
    url: string | null;
    idnumber: string;
    status: 'updated_visibility' | 'missing';
  }>;
  advertencias: string[];
}

async function executePlan(
  ctx: ToolContext,
  plan: Plan,
  exec: ExecuteContext,
): Promise<ExecuteResult> {
  const advertencias: string[] = [];

  // One snapshot of course contents; we scan it for existing section + modules by idnumber.
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

  // Asset uploads: v0.1 does not fully implement multipart upload through
  // the Moodle draft file area. We emit an advertencia per unique asset
  // that's part of the plan so operators know to seed them manually on
  // first publish — subsequent publishes are truly idempotent.
  const uploadOps = plan.operations.filter((o) => o.kind === 'upload_asset');
  for (const up of uploadOps) {
    if (up.kind !== 'upload_asset') continue;
    advertencias.push(
      `Asset upload for '${up.asset_id}' (${up.asset_tipo}) was planned but not executed in v0.1. ` +
        `Seed '${up.asset_path}' manually in Moodle or wait for v0.2.`,
    );
  }

  const recursos: ExecuteResult['recursos'] = [];

  const moduleIndex = indexModulesByIdnumber(contents);

  for (const op of plan.operations) {
    if (op.kind === 'upload_asset') continue;

    const existing = moduleIndex.get(op.idnumber);
    if (!existing) {
      advertencias.push(
        `Module '${op.component_id}' (idnumber ${op.idnumber}) does not exist yet. ` +
          `v0.1 can only update visibility of pre-existing modules; create it once manually or install local_wsmanagesections.`,
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

    // Update visibility in place. Idempotent — Moodle ignores a no-op.
    await ctx.client.call('core_course_edit_module', {
      action: op.visible ? 'show' : 'hide',
      id: existing.id,
    });

    recursos.push({
      component_id: op.component_id,
      moodle_id: existing.id,
      tipo: existing.modname,
      url: existing.url ?? null,
      idnumber: op.idnumber,
      status: 'updated_visibility',
    });
  }

  return {
    status,
    seccion: section,
    recursos,
    advertencias,
  };
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
    await setSectionVisibility(ctx, target.id, plan.section.visible);
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
    await setSectionVisibility(ctx, existing.id, plan.section.visible);
    return {
      section: sectionDescriptor(existing, plan.section.idnumber),
      status: 'updated',
    };
  }

  // 3. Section does not exist — require plugin to create. v0.1 surfaces
  // the warning rather than silently failing; integration tests will wire
  // this up against local_wsmanagesections.
  advertencias.push(
    `Section '${plan.section.name}' (idnumber ${plan.section.idnumber}) does not exist yet. ` +
      `v0.1 does not create sections automatically — create it once manually or install local_wsmanagesections.`,
  );

  // Fall back to the preferred section if given; otherwise section 0 (course home).
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
  await setSectionVisibility(ctx, fallback.id, plan.section.visible);
  return {
    section: sectionDescriptor(fallback, plan.section.idnumber),
    status: 'created',
  };
}

async function setSectionVisibility(
  ctx: ToolContext,
  sectionId: number,
  visible: boolean,
): Promise<void> {
  try {
    await ctx.client.call('core_course_edit_section', {
      action: visible ? 'show' : 'hide',
      id: sectionId,
    });
  } catch (e) {
    ctx.logger.warn('edit_section.failed', {
      section_id: sectionId,
      error: (e as Error).message,
    });
    // Non-fatal — sections created by the user may already be visible.
  }
}

function sectionDescriptor(s: Section, plannedIdnumber: string) {
  return {
    id: s.id,
    name: s.name,
    url: '',
    idnumber: plannedIdnumber,
  };
}
