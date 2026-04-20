import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { buildIdnumber } from '../_common/helpers.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_num: z.number().int().min(0).default(0),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/)
      .describe('Stable slug for this quiz. Same slug → same quiz (idempotent).'),
    name: z.string().min(1).max(254),
    intro: z.string().default(''),
    gift_text: z
      .string()
      .min(10)
      .describe('GIFT-formatted question block. Will be imported into the quiz.'),
    category_name: z.string().default(''),
    /** Config pass-through. Kept thin; configurar_quiz has the exhaustive schema. */
    attempts: z.number().int().min(0).max(10).default(0),
    timelimit_seconds: z.number().int().min(0).default(0),
    grademethod: z.enum(['highest', 'average', 'first', 'last']).default('highest'),
    grade: z.number().min(0).max(1000).default(10),
    visible: z.boolean().default(false),
    repair_sections: z
      .boolean()
      .default(true)
      .describe(
        'After import, call repair_quiz_sections to ensure the quiz has a default quiz_sections row (fixes "noquestionsfound" attempts).',
      ),
    promote_questions: z
      .boolean()
      .default(true)
      .describe(
        'After import, promote question_versions from draft to ready (makes them visible in attempts).',
      ),
  })
  .strict();

export type PublicarFichaExamenInput = z.infer<typeof InputSchema>;

const GRADEMETHOD_MAP: Record<PublicarFichaExamenInput['grademethod'], number> = {
  highest: 1,
  average: 2,
  first: 3,
  last: 4,
};

/**
 * One-shot: create/update quiz + import GIFT questions + repair
 * quiz_sections + promote drafts → ready.
 *
 * This is the "happy path" for Alicia's workflow: she has a GIFT block
 * and wants a ready-to-take quiz. Equivalent to composing
 * `configurar_quiz` + `importar_gift` + the two plugin maintenance
 * endpoints (`repair_quiz_sections`, `promote_quiz_questions`) in the
 * correct order.
 *
 * Idempotent: re-running with the same (course_id, slug) updates the
 * quiz shell in place and dedupes questions (by name) in the category.
 */
export function buildPublicarFichaExamenTool(): ToolDefinition<PublicarFichaExamenInput> {
  return {
    name: 'publicar_ficha_examen',
    description:
      'Create or update a quiz and populate it with GIFT questions in one call. Runs plugin repair+promote steps after import so the quiz is immediately attemptable. Idempotent by (course_id, slug).',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const publicarFichaExamenTool = buildPublicarFichaExamenTool();

async function execute(
  args: PublicarFichaExamenInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const quiz_idnumber = buildIdnumber('quiz', `${args.course_id}-${args.slug}`);

    // Step 1: upsert quiz shell.
    const quizResult = (await ctx.client.call('local_italiciamcp_upsert_quiz', {
      courseid: args.course_id,
      sectionnum: args.section_num,
      idnumber: quiz_idnumber,
      name: args.name,
      intro: args.intro,
      timeopen: 0,
      timeclose: 0,
      timelimit: args.timelimit_seconds,
      attempts: args.attempts,
      grademethod: GRADEMETHOD_MAP[args.grademethod],
      grade: args.grade,
      visible: args.visible ? 1 : 0,
    })) as { action: 'created' | 'updated'; cmid: number; instanceid: number; url: string };

    // Step 2: import GIFT questions and append to quiz.
    const giftResult = (await ctx.client.call('local_italiciamcp_add_questions_gift', {
      courseid: args.course_id,
      quiz_idnumber,
      gift: args.gift_text,
      category_name: args.category_name,
      append: 1,
    })) as { created: number; existing: number; appended: number; category_id: number };

    // Step 3: post-import plugin fixes (known issues documented in
    // moodle-mcp v0.3.8 — repair_quiz_sections fixes noquestionsfound,
    // promote_quiz_questions makes draft versions visible).
    const warnings: string[] = [];

    if (args.repair_sections) {
      try {
        await ctx.client.call('local_italiciamcp_repair_quiz_sections', {
          quiz_idnumber,
        });
      } catch (e) {
        warnings.push(`repair_quiz_sections failed: ${(e as Error).message}`);
      }
    }

    if (args.promote_questions) {
      try {
        await ctx.client.call('local_italiciamcp_promote_quiz_questions', {
          quiz_idnumber,
        });
      } catch (e) {
        warnings.push(`promote_quiz_questions failed: ${(e as Error).message}`);
      }
    }

    return toJsonResponse({
      action: quizResult.action,
      cmid: quizResult.cmid,
      quiz_id: quizResult.instanceid,
      url: quizResult.url,
      idnumber: quiz_idnumber,
      questions_created: giftResult.created,
      questions_existing_reused: giftResult.existing,
      questions_appended: giftResult.appended,
      bank_category_id: giftResult.category_id,
      warnings,
    });
  } catch (e) {
    ctx.logger.warn('publicar_ficha_examen.failed', {
      course_id: args.course_id,
      slug: args.slug,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
