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
    quiz_id: z.number().int().positive(),
    user_id: z.number().int().positive(),
    status: z
      .enum(['finished', 'in_progress', 'overdue', 'abandoned', 'all'])
      .default('finished'),
    include_review: z
      .boolean()
      .default(false)
      .describe('If true, fetches per-attempt review detail (heavier — use sparingly).'),
  })
  .strict();

export type ObtenerIntentosQuizInput = z.infer<typeof InputSchema>;

interface WsAttempt {
  id: number;
  quiz: number;
  userid: number;
  attempt: number;
  state: string;
  timestart?: number;
  timefinish?: number;
  sumgrades?: number | null;
}

/**
 * Quiz attempts for a user on a specific quiz. Optionally fetches the
 * review payload for each finished attempt (which questions, which
 * answers, which got graded).
 */
export function buildObtenerIntentosQuizTool(): ToolDefinition<ObtenerIntentosQuizInput> {
  return {
    name: 'obtener_intentos_quiz',
    description:
      'Quiz attempts for a user on a given quiz. Default: only finished attempts. Set include_review=true to also fetch per-question details (heavier).',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const obtenerIntentosQuizTool = buildObtenerIntentosQuizTool();

async function execute(
  args: ObtenerIntentosQuizInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const raw = (await ctx.client.call('mod_quiz_get_user_quiz_attempts', {
      quizid: args.quiz_id,
      userid: args.user_id,
      status: args.status,
    })) as { attempts?: WsAttempt[] } | undefined;

    const attempts = raw?.attempts ?? [];
    const flat = attempts.map((a) => ({
      attempt_id: a.id,
      attempt_number: a.attempt,
      state: a.state,
      started_at: a.timestart ?? null,
      finished_at: a.timefinish ?? null,
      sum_grades: a.sumgrades ?? null,
    }));

    let reviews: Array<Record<string, unknown>> | undefined;
    if (args.include_review && attempts.length > 0) {
      reviews = [];
      for (const a of attempts) {
        try {
          const rv = (await ctx.client.call('mod_quiz_get_attempt_review', {
            attemptid: a.id,
          })) as Record<string, unknown>;
          reviews.push({ attempt_id: a.id, review: rv });
        } catch (e) {
          reviews.push({
            attempt_id: a.id,
            review_error: (e as Error).message,
          });
        }
      }
    }

    return toJsonResponse({
      quiz_id: args.quiz_id,
      user_id: args.user_id,
      attempts_count: flat.length,
      attempts: flat,
      ...(reviews && { reviews }),
    });
  } catch (e) {
    ctx.logger.warn('obtener_intentos_quiz.failed', {
      quiz_id: args.quiz_id,
      user_id: args.user_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
