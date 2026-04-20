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
    hours_since: z
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(24)
      .describe('Window (in hours) to flag a user as "recent". Default 24h.'),
  })
  .strict();

export type ObtenerLogsCursoInput = z.infer<typeof InputSchema>;

interface EnrolledUser {
  id: number;
  fullname: string;
  firstaccess?: number;
  lastaccess?: number;
  lastcourseaccess?: number;
  roles?: Array<{ shortname: string }>;
}

/**
 * Approximates "activity log" from what core WS does expose — the
 * `firstaccess` and `lastaccess` fields returned by
 * core_enrol_get_enrolled_users. Moodle core does not expose a
 * generic activity-log WS (tool_log_manager is not in the public
 * WS surface).
 *
 * Returns per-user first/last access timestamps plus a boolean
 * `active_within_window` flag based on `hours_since`. Sorts users by
 * last access desc so the most recently-active show up first.
 */
export function buildObtenerLogsCursoTool(): ToolDefinition<ObtenerLogsCursoInput> {
  return {
    name: 'obtener_logs_curso',
    description:
      'Approximate activity log for a course: per-user firstaccess/lastaccess derived from core_enrol_get_enrolled_users. Flags users active within the last N hours (default 24). Moodle core does not expose a generic activity-log WS.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const obtenerLogsCursoTool = buildObtenerLogsCursoTool();

async function execute(args: ObtenerLogsCursoInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const raw = (await ctx.client.call('core_enrol_get_enrolled_users', {
      courseid: args.course_id,
    })) as EnrolledUser[] | undefined;

    const users = Array.isArray(raw) ? raw : [];
    const now = Math.floor(Date.now() / 1000);
    const windowSecs = args.hours_since * 3600;

    const rows = users
      .map((u) => {
        const last = u.lastcourseaccess ?? u.lastaccess ?? null;
        const active = last !== null && now - last <= windowSecs;
        return {
          user_id: u.id,
          fullname: u.fullname,
          first_access: u.firstaccess ?? null,
          last_access: last,
          active_within_window: active,
          roles: (u.roles ?? []).map((r) => r.shortname),
        };
      })
      .sort((a, b) => (b.last_access ?? 0) - (a.last_access ?? 0));

    const summary = {
      total_enrolled: rows.length,
      active_within_window: rows.filter((r) => r.active_within_window).length,
      never_accessed: rows.filter((r) => r.last_access === null).length,
    };

    return toJsonResponse({
      course_id: args.course_id,
      hours_since: args.hours_since,
      summary,
      users: rows,
    });
  } catch (e) {
    ctx.logger.warn('obtener_logs_curso.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
