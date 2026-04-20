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
    visible: z.boolean().default(false).describe('false = archive/hide, true = unarchive/show'),
  })
  .strict();

export type ArchivarCursoInput = z.infer<typeof InputSchema>;

/**
 * Soft-archive a course by setting `visible=0`. This is intentionally
 * distinct from `actualizar_curso` because it captures a specific
 * intent in agent transcripts ("archiva el curso X") and the usual
 * UX expects the inverse (`visible=true`) to un-archive.
 *
 * Not destructive: data stays intact, enrolments remain, teachers can
 * still see and edit. Only students lose access to the course card.
 */
export function buildArchivarCursoTool(): ToolDefinition<ArchivarCursoInput> {
  return {
    name: 'archivar_curso',
    description:
      'Archive (visible=0) or un-archive (visible=1) a course. Non-destructive: data, enrolments and teacher access stay intact. Use it for end-of-year cleanup or hiding a course in preparation.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const archivarCursoTool = buildArchivarCursoTool();

async function execute(args: ArchivarCursoInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    await ctx.client.call('core_course_update_courses', {
      courses: [{ id: args.course_id, visible: args.visible ? 1 : 0 }],
    });

    return toJsonResponse({
      course_id: args.course_id,
      visible: args.visible,
      archived: !args.visible,
    });
  } catch (e) {
    ctx.logger.warn('archivar_curso.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
