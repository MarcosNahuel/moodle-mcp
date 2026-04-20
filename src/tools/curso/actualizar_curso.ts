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
    fullname: z.string().min(1).max(254).optional(),
    shortname: z.string().min(1).max(100).optional(),
    summary: z.string().optional(),
    visible: z.boolean().optional(),
    lang: z.string().optional(),
    categoryid: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.fullname !== undefined ||
      v.shortname !== undefined ||
      v.summary !== undefined ||
      v.visible !== undefined ||
      v.lang !== undefined ||
      v.categoryid !== undefined,
    { message: 'At least one field to update is required' },
  );

export type ActualizarCursoInput = z.infer<typeof InputSchema>;

/**
 * Partial-update semantics: only the provided fields are forwarded to
 * core_course_update_courses. Other fields stay as Moodle has them.
 */
export function buildActualizarCursoTool(): ToolDefinition<ActualizarCursoInput> {
  return {
    name: 'actualizar_curso',
    description:
      'Update one or more fields of a course (fullname / shortname / summary / visible / lang / categoryid). At least one field is required.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const actualizarCursoTool = buildActualizarCursoTool();

async function execute(args: ActualizarCursoInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const update: Record<string, unknown> = { id: args.course_id };
    if (args.fullname !== undefined) update.fullname = args.fullname;
    if (args.shortname !== undefined) update.shortname = args.shortname;
    if (args.summary !== undefined) {
      update.summary = args.summary;
      update.summaryformat = 1;
    }
    if (args.visible !== undefined) update.visible = args.visible ? 1 : 0;
    if (args.lang !== undefined) update.lang = args.lang;
    if (args.categoryid !== undefined) update.categoryid = args.categoryid;

    await ctx.client.call('core_course_update_courses', {
      courses: [update],
    });

    return toJsonResponse({
      course_id: args.course_id,
      updated_fields: Object.keys(update).filter((k) => k !== 'id'),
    });
  } catch (e) {
    ctx.logger.warn('actualizar_curso.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
