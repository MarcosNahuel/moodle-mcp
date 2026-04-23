import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';

const AnswerEditSchema = z
  .object({
    index: z.number().int().min(0).describe('0-based index of the answer (ordered by question_answers.id ASC).'),
    answer: z.string().default('').describe('New answer text (HTML). Pass "" to skip.'),
    feedback: z.string().default('').describe('New feedback HTML. Pass "" to skip.'),
    fraction: z
      .number()
      .default(-999)
      .describe('1.0 correct, 0.0 wrong, or partial fraction. Pass -999 to skip.'),
  })
  .strict();

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    question_id: z
      .number()
      .int()
      .positive()
      .describe('Moodle question.id (NOT question_bank_entries.id). Get it from importar_gift output or question bank UI.'),
    name: z.string().default('').describe('New question name. Pass "" to skip.'),
    question_text: z
      .string()
      .default('')
      .describe('New question text (HTML). Pass "" to skip.'),
    answers: z
      .array(AnswerEditSchema)
      .default([])
      .describe(
        'Optional list of answer edits. Each item targets an answer by its 0-based index. Empty array = no answer edits.',
      ),
  })
  .strict();

export type ModificarPreguntaInput = z.infer<typeof InputSchema>;

/**
 * Edit an existing question in-place by writing directly to
 * `question` + `question_answers` tables. Bypass for the Moodle 5.0.2
 * qbank edit form silent-fail bug (see moodle/decisiones-y-lecciones.md L13).
 *
 * Wraps `local_italiciamcp_update_question_simple`. Typical use:
 *   "arreglá el typo de la pregunta 169 del curso 2, debería decir 'casa' no 'caza'"
 *
 * Coverage: name, question_text, answers[].{answer,feedback,fraction}.
 * For tags, matching pairs, calculated variables: use the Moodle UI directly
 * (the plugin's JS interceptor will route the save through this same endpoint).
 */
export function buildModificarPreguntaTool(): ToolDefinition<ModificarPreguntaInput> {
  return {
    name: 'modificar_pregunta',
    description:
      'Edit an existing question (typo fix, reformulation, feedback tweak). Writes directly to DB, bypass Moodle 5.0.2 qbank form bug. Input: course_id, question_id, optional name / question_text / answers[]. Coverage: name, text, answers (answer/feedback/fraction).',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const modificarPreguntaTool = buildModificarPreguntaTool();

async function execute(args: ModificarPreguntaInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const result = (await ctx.client.call('local_italiciamcp_update_question_simple', {
      courseid: args.course_id,
      question_id: args.question_id,
      name: args.name,
      questiontext: args.question_text,
      answers: args.answers.map((a) => ({
        index: a.index,
        answer: a.answer,
        feedback: a.feedback,
        fraction: a.fraction,
      })),
    })) as {
      question_id: number;
      name: string;
      question_fields_changed: string[];
      answers_updated: Array<{ index: number; answer_id: number; fields: string[] }>;
    };

    return toJsonResponse({
      question_id: result.question_id,
      current_name: result.name,
      fields_changed: result.question_fields_changed,
      answers_updated: result.answers_updated,
      human_summary:
        result.question_fields_changed.length === 0 && result.answers_updated.length === 0
          ? 'Sin cambios (pasaste todos los campos vacíos).'
          : `Pregunta ${result.question_id} actualizada: ${[
              ...result.question_fields_changed,
              ...result.answers_updated.map((a) => `answer[${a.index}].${a.fields.join(',')}`),
            ].join(' + ')}.`,
    });
  } catch (e) {
    ctx.logger.warn('modificar_pregunta.failed', {
      course_id: args.course_id,
      question_id: args.question_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
