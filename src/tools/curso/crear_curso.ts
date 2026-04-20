import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { MoodleWsError } from '../../client/errors.js';
import { buildIdnumber } from '../_common/helpers.js';

const InputSchema = z
  .object({
    fullname: z.string().min(1).max(254),
    shortname: z.string().min(1).max(100),
    categoryid: z.number().int().positive().default(1),
    idnumber_slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, { message: 'idnumber_slug must be kebab-case lowercase alnum' })
      .describe('Stable slug used to build the course idnumber (ej: "italiano-a2-2026")'),
    summary: z.string().default(''),
    format: z.enum(['topics', 'weeks', 'single_activity', 'social']).default('topics'),
    numsections: z.number().int().min(0).max(52).default(10),
    visible: z.boolean().default(false),
    lang: z.string().default(''),
  })
  .strict();

export type CrearCursoInput = z.infer<typeof InputSchema>;

interface WsCreatedCourse {
  id: number;
  shortname: string;
}

/**
 * Create a new Moodle course. Idempotent by `idnumber_slug`: if a course
 * with the derived idnumber already exists we do NOT recreate it — we
 * throw `MOODLE_WS_COURSE_EXISTS` so the caller can decide whether to
 * actualizar_curso instead.
 *
 * Why throw instead of fall-through to update: `crear_curso` is a
 * creation intent. Silently returning the existing course hides drift
 * (e.g. Alicia meant "new empty course" but got the old one with
 * content). `actualizar_curso` is the right tool for updates.
 */
export function buildCrearCursoTool(): ToolDefinition<CrearCursoInput> {
  return {
    name: 'crear_curso',
    description:
      'Create a new Moodle course with a stable idnumber. Throws MOODLE_WS_COURSE_EXISTS if the idnumber is already in use. Default: hidden (visible=false), topics format, 10 sections.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const crearCursoTool = buildCrearCursoTool();

async function execute(args: CrearCursoInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const idnumber = buildIdnumber('course', args.idnumber_slug);

    // Idempotency guard: reject if a course already exists with this idnumber.
    const existing = (await ctx.client.call('core_course_get_courses_by_field', {
      field: 'idnumber',
      value: idnumber,
    })) as { courses?: Array<{ id: number; fullname: string }> } | undefined;

    if (Array.isArray(existing?.courses) && existing.courses.length > 0) {
      const first = existing.courses[0]!;
      throw new MoodleWsError(
        `Course with idnumber '${idnumber}' already exists (id=${first.id}, fullname='${first.fullname}'). Use actualizar_curso to modify it.`,
        {
          code: 'MOODLE_WS_COURSE_EXISTS',
          details: { idnumber, course_id: first.id },
        },
      );
    }

    const created = (await ctx.client.call('core_course_create_courses', {
      courses: [
        {
          fullname: args.fullname,
          shortname: args.shortname,
          categoryid: args.categoryid,
          idnumber,
          summary: args.summary,
          summaryformat: 1, // FORMAT_HTML
          format: args.format,
          numsections: args.numsections,
          visible: args.visible ? 1 : 0,
          ...(args.lang !== '' && { lang: args.lang }),
        },
      ],
    })) as WsCreatedCourse[] | undefined;

    if (!Array.isArray(created) || created.length === 0) {
      throw new MoodleWsError(
        'core_course_create_courses returned no course',
        { code: 'MOODLE_WS_UNEXPECTED', details: { response: created } },
      );
    }

    const row = created[0]!;
    return toJsonResponse({
      course_id: row.id,
      shortname: row.shortname,
      idnumber,
      visible: args.visible,
    });
  } catch (e) {
    ctx.logger.warn('crear_curso.failed', {
      shortname: args.shortname,
      slug: args.idnumber_slug,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
