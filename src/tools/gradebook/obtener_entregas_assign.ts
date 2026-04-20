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
    assign_id: z.number().int().positive().describe('assign.instance id (NOT cmid).'),
    status: z
      .enum(['submitted', 'draft', 'new', 'reopened', 'any'])
      .default('submitted'),
    include_status_per_user: z
      .boolean()
      .default(false)
      .describe(
        'If true, fetches submission status (grading state, due/late flags) per user — heavier.',
      ),
    user_ids: z
      .array(z.number().int().positive())
      .optional()
      .describe('If set with include_status_per_user, only fetches status for these users.'),
  })
  .strict();

export type ObtenerEntregasAssignInput = z.infer<typeof InputSchema>;

interface WsAssignment {
  id: number;
  name: string;
  submissions: Array<{
    id: number;
    userid: number;
    attemptnumber: number;
    timemodified: number;
    timestarted?: number;
    status: string;
    groupid?: number;
    latest: boolean;
    plugins?: unknown[];
  }>;
}

/**
 * Submissions for one assignment. Returns minimal per-submission fields
 * by default; include_status_per_user fetches per-user grading state.
 */
export function buildObtenerEntregasAssignTool(): ToolDefinition<ObtenerEntregasAssignInput> {
  return {
    name: 'obtener_entregas_assign',
    description:
      'Submissions for an assignment (default: only submitted state). Optionally fetch per-user grading status.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const obtenerEntregasAssignTool = buildObtenerEntregasAssignTool();

async function execute(
  args: ObtenerEntregasAssignInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const raw = (await ctx.client.call('mod_assign_get_submissions', {
      assignmentids: [args.assign_id],
      status: args.status,
    })) as { assignments?: WsAssignment[] } | undefined;

    const asg = (raw?.assignments ?? []).find((a) => a.id === args.assign_id);
    const submissions = (asg?.submissions ?? []).map((s) => ({
      submission_id: s.id,
      user_id: s.userid,
      attempt_number: s.attemptnumber,
      status: s.status,
      modified_at: s.timemodified,
      started_at: s.timestarted ?? null,
      latest: s.latest,
      group_id: s.groupid ?? null,
    }));

    let statuses: Array<Record<string, unknown>> | undefined;
    if (args.include_status_per_user) {
      statuses = [];
      const targetUsers =
        args.user_ids ?? submissions.map((s) => s.user_id);
      for (const uid of targetUsers) {
        try {
          const st = (await ctx.client.call('mod_assign_get_submission_status', {
            assignid: args.assign_id,
            userid: uid,
          })) as Record<string, unknown>;
          statuses.push({ user_id: uid, status: st });
        } catch (e) {
          statuses.push({ user_id: uid, error: (e as Error).message });
        }
      }
    }

    return toJsonResponse({
      assign_id: args.assign_id,
      submissions_count: submissions.length,
      submissions,
      ...(statuses && { statuses }),
    });
  } catch (e) {
    ctx.logger.warn('obtener_entregas_assign.failed', {
      assign_id: args.assign_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
