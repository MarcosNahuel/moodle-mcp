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
    quiz_slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/)
      .describe('Slug that identifies the target quiz (same used in configurar_quiz).'),
    gift_text: z
      .string()
      .min(10)
      .describe('Full GIFT-format text block with one or more questions.'),
    category_name: z
      .string()
      .default('')
      .describe('Question bank category to drop the questions in. Defaults to the quiz name.'),
    append: z
      .boolean()
      .default(true)
      .describe('If true, append to quiz slots. If false, only create in bank without attaching.'),
  })
  .strict();

export type ImportarGiftInput = z.infer<typeof InputSchema>;

/**
 * Parse GIFT text, create the questions in a course bank category, and
 * optionally append them to the quiz (identified by quiz_slug, same the
 * caller used in configurar_quiz).
 *
 * Wraps `local_italiciamcp_add_questions_gift`. Idempotent when the
 * plugin detects duplicates (dedupe by question name).
 */
export function buildImportarGiftTool(): ToolDefinition<ImportarGiftInput> {
  return {
    name: 'importar_gift',
    description:
      'Import GIFT-formatted questions into a quiz. Creates the questions in a bank category and appends them to the quiz slots by default. Idempotent (plugin dedupes by question name within the category).',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const importarGiftTool = buildImportarGiftTool();

async function execute(args: ImportarGiftInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const quiz_idnumber = buildIdnumber('quiz', `${args.course_id}-${args.quiz_slug}`);
    const result = (await ctx.client.call('local_italiciamcp_add_questions_gift', {
      courseid: args.course_id,
      quiz_idnumber,
      gift: args.gift_text,
      category_name: args.category_name,
      append: args.append ? 1 : 0,
    })) as {
      created: number;
      existing: number;
      appended: number;
      category_id: number;
    };

    return toJsonResponse({
      quiz_idnumber,
      questions_created: result.created,
      questions_existing_reused: result.existing,
      appended_to_quiz: result.appended,
      bank_category_id: result.category_id,
    });
  } catch (e) {
    ctx.logger.warn('importar_gift.failed', {
      course_id: args.course_id,
      quiz_slug: args.quiz_slug,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
