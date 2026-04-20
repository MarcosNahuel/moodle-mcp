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
    assign_id: z.number().int().positive(),
    user_id: z.number().int().positive(),
    grade: z
      .number()
      .min(-100)
      .max(1000)
      .describe('Numeric grade. -1 means "no grade yet". Negative values other than -1 are invalid in most scales.'),
    feedback_text: z.string().default(''),
    apply_to_all_members: z
      .boolean()
      .default(false)
      .describe('If the assignment uses team submission, apply this grade to every member of the team.'),
    workflow_state: z
      .enum(['notmarked', 'inmarking', 'readyforreview', 'inreview', 'readyforrelease', 'released'])
      .optional()
      .describe('Marking workflow state (only applies when the assignment has workflow enabled).'),
    attempt_number: z
      .number()
      .int()
      .min(-1)
      .default(-1)
      .describe('-1 = grade the latest attempt. Otherwise specify the attempt number.'),
  })
  .strict();

export type CalificarManualmenteInput = z.infer<typeof InputSchema>;

/**
 * Manually grade an assignment submission. Uses mod_assign_save_grade
 * so the grade flows through Moodle's usual gradebook + notifications
 * pipeline (same result as grading in the UI).
 */
export function buildCalificarManualmenteTool(): ToolDefinition<CalificarManualmenteInput> {
  return {
    name: 'calificar_manualmente',
    description:
      'Manually grade an assignment submission (mod_assign_save_grade). Feedback text is HTML-safe. Supports team grading and marking workflow state.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const calificarManualmenteTool = buildCalificarManualmenteTool();

async function execute(
  args: CalificarManualmenteInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const params: Record<string, unknown> = {
      assignmentid: args.assign_id,
      userid: args.user_id,
      grade: args.grade,
      attemptnumber: args.attempt_number,
      addattempt: 0,
      applytoall: args.apply_to_all_members ? 1 : 0,
      plugindata: {
        assignfeedbackcomments_editor: {
          text: args.feedback_text,
          format: 1, // HTML
        },
      },
    };
    if (args.workflow_state) {
      params.workflowstate = args.workflow_state;
    }

    await ctx.client.call('mod_assign_save_grade', params);

    return toJsonResponse({
      assign_id: args.assign_id,
      user_id: args.user_id,
      grade: args.grade,
      workflow_state: args.workflow_state ?? null,
      applied: true,
    });
  } catch (e) {
    ctx.logger.warn('calificar_manualmente.failed', {
      assign_id: args.assign_id,
      user_id: args.user_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
