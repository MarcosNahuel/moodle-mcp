import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';

const InputSchema = z
  .object({
    userid: z
      .number()
      .int()
      .positive()
      .describe(
        'Moodle user id whose courses to list. Use obtener_info_sitio / core_webservice_get_site_info to find the bot user id.',
      ),
    only_visible: z
      .boolean()
      .default(false)
      .describe('If true, filter out hidden (archived) courses.'),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export type ListarMisCursosInput = z.infer<typeof InputSchema>;

interface WsEnrolledCourse {
  id: number;
  fullname: string;
  shortname: string;
  idnumber?: string;
  visible: number;
  category?: number;
  format?: string;
  startdate?: number;
}

/**
 * List the courses where the given user is enrolled (as teacher/student
 * — Moodle WS does not differentiate here). The returned list is sorted
 * by startdate desc so the most recent cohort appears first.
 */
export function buildListarMisCursosTool(): ToolDefinition<ListarMisCursosInput> {
  return {
    name: 'listar_mis_cursos',
    description:
      'List courses where a user is enrolled. Accepts userid (ej: obtain from obtener_info_sitio for the bot, or pass an alumno_id-mapped Moodle userid).',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const listarMisCursosTool = buildListarMisCursosTool();

async function execute(args: ListarMisCursosInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const raw = (await ctx.client.call('core_enrol_get_users_courses', {
      userid: args.userid,
    })) as WsEnrolledCourse[] | undefined;

    const courses = Array.isArray(raw) ? raw : [];
    const filtered = args.only_visible
      ? courses.filter((c) => c.visible === 1)
      : courses;

    const sorted = [...filtered].sort(
      (a, b) => (b.startdate ?? 0) - (a.startdate ?? 0),
    );

    const limited = sorted.slice(0, args.limit).map((c) => ({
      course_id: c.id,
      fullname: c.fullname,
      shortname: c.shortname,
      idnumber: c.idnumber ?? null,
      visible: c.visible === 1,
      category_id: c.category ?? null,
      format: c.format ?? null,
      startdate: c.startdate ?? null,
    }));

    return toJsonResponse({
      userid: args.userid,
      total_enrolled: courses.length,
      returned: limited.length,
      courses: limited,
    });
  } catch (e) {
    ctx.logger.warn('listar_mis_cursos.failed', {
      userid: args.userid,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
