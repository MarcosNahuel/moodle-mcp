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
    course_id: z.number().int().positive(),
    user_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('If omitted, returns grades for all enrolled users in the course.'),
  })
  .strict();

export type ObtenerCalificacionesInput = z.infer<typeof InputSchema>;

interface WsGradeItem {
  id: number;
  itemname: string;
  itemmodule?: string;
  iteminstance?: number;
  grademax?: number;
  grademin?: number;
  cmid?: number;
  graderaw?: number | null;
  gradeformatted?: string;
  feedback?: string;
  feedbackformat?: number;
}

interface WsUserGrades {
  userid: number;
  userfullname: string;
  gradeitems: WsGradeItem[];
}

/**
 * Fetch grades for a single user or for all enrolled users in a course.
 * Wraps gradereport_user_get_grade_items and flattens to a concise
 * per-item payload with raw grade, max, and feedback.
 */
export function buildObtenerCalificacionesTool(): ToolDefinition<ObtenerCalificacionesInput> {
  return {
    name: 'obtener_calificaciones',
    description:
      'Get gradebook entries for a user in a course (or for every enrolled user if user_id is omitted). Returns raw/max grade, item name, module type, feedback.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const obtenerCalificacionesTool = buildObtenerCalificacionesTool();

async function execute(
  args: ObtenerCalificacionesInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const params: Record<string, unknown> = { courseid: args.course_id };
    if (args.user_id !== undefined) params.userid = args.user_id;

    const raw = (await ctx.client.call('gradereport_user_get_grade_items', params)) as
      | { usergrades?: WsUserGrades[] }
      | undefined;

    const usergrades = raw?.usergrades ?? [];
    const flattened = usergrades.map((u) => ({
      user_id: u.userid,
      fullname: u.userfullname,
      items: u.gradeitems.map((g) => ({
        item_id: g.id,
        name: g.itemname,
        module: g.itemmodule ?? null,
        cmid: g.cmid ?? null,
        grade_raw: g.graderaw ?? null,
        grade_max: g.grademax ?? null,
        grade_formatted: g.gradeformatted ?? null,
        feedback: g.feedback ?? '',
      })),
    }));

    return toJsonResponse({
      course_id: args.course_id,
      user_count: flattened.length,
      users: flattened,
    });
  } catch (e) {
    ctx.logger.warn('obtener_calificaciones.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
