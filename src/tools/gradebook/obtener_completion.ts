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
    user_id: z.number().int().positive(),
  })
  .strict();

export type ObtenerCompletionInput = z.infer<typeof InputSchema>;

interface WsCompletionStatus {
  cmid: number;
  modname: string;
  instance: number;
  state: number; // 0 incomplete, 1 complete, 2 complete-pass, 3 complete-fail
  timecompleted?: number;
  tracking: number;
  overrideby?: number | null;
  valueused?: boolean;
  details?: unknown;
}

const STATE_MAP: Record<number, string> = {
  0: 'incomplete',
  1: 'complete',
  2: 'complete_pass',
  3: 'complete_fail',
};

/**
 * Activity completion status per cmid for a given user in a course.
 */
export function buildObtenerCompletionTool(): ToolDefinition<ObtenerCompletionInput> {
  return {
    name: 'obtener_completion',
    description:
      'Activity completion status for a user in a course: per cmid, the state (incomplete / complete / complete_pass / complete_fail) plus completion timestamp.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const obtenerCompletionTool = buildObtenerCompletionTool();

async function execute(args: ObtenerCompletionInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const raw = (await ctx.client.call(
      'core_completion_get_activities_completion_status',
      {
        courseid: args.course_id,
        userid: args.user_id,
      },
    )) as { statuses?: WsCompletionStatus[] } | undefined;

    const statuses = raw?.statuses ?? [];
    const flat = statuses.map((s) => ({
      cmid: s.cmid,
      module: s.modname,
      instance: s.instance,
      state: STATE_MAP[s.state] ?? `unknown:${s.state}`,
      completed_at: s.timecompleted ?? null,
      tracking: s.tracking,
    }));

    const summary = {
      total: flat.length,
      complete: flat.filter((s) => s.state.startsWith('complete')).length,
      incomplete: flat.filter((s) => s.state === 'incomplete').length,
    };

    return toJsonResponse({
      course_id: args.course_id,
      user_id: args.user_id,
      summary,
      activities: flat,
    });
  } catch (e) {
    ctx.logger.warn('obtener_completion.failed', {
      course_id: args.course_id,
      user_id: args.user_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
