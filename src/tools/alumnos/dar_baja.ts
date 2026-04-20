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
    user_ids: z.array(z.number().int().positive()).min(1),
  })
  .strict();

export type DarBajaInput = z.infer<typeof InputSchema>;

/**
 * Unenrol one or more users from a course (manual enrolment method).
 * Their data (grades, submissions, attempts) is kept; only the enrolment
 * link is removed, so re-enrolling later restores access.
 */
export function buildDarBajaTool(): ToolDefinition<DarBajaInput> {
  return {
    name: 'dar_baja',
    description:
      'Unenrol one or more users from a course. Non-destructive: user data is preserved, only the course enrolment link is removed.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const darBajaTool = buildDarBajaTool();

async function execute(args: DarBajaInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    await ctx.client.call('enrol_manual_unenrol_users', {
      enrolments: args.user_ids.map((userid) => ({
        userid,
        courseid: args.course_id,
      })),
    });

    return toJsonResponse({
      course_id: args.course_id,
      unenrolled: args.user_ids.length,
      user_ids: args.user_ids,
    });
  } catch (e) {
    ctx.logger.warn('dar_baja.failed', {
      course_id: args.course_id,
      count: args.user_ids.length,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
