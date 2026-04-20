import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { MoodleWsError } from '../../client/errors.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    name: z.string().min(1).max(255),
    summary: z.string().default(''),
    position: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Position in the course section list; 0 appends at the end.'),
    visible: z.boolean().default(true),
  })
  .strict();

export type CrearSeccionInput = z.infer<typeof InputSchema>;

interface WsCreateSectionItem {
  sectionid: number;
  sectionnumber: number;
}

/**
 * Create a new course section via `local_wsmanagesections_create_sections`
 * and immediately set its `name`, `summary` and `visible` via
 * `local_wsmanagesections_update_sections`. Returns the new section's
 * identifiers so the caller can link further content to it.
 *
 * Not idempotent by itself (the plugin has no "find-or-create" semantics
 * for sections). Callers should check course contents first if they want
 * idempotency by name.
 */
export function buildCrearSeccionTool(): ToolDefinition<CrearSeccionInput> {
  return {
    name: 'crear_seccion',
    description:
      'Create a new section in a course with a given name, summary, position and initial visibility. Requires the `local_wsmanagesections` plugin.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const crearSeccionTool = buildCrearSeccionTool();

async function execute(args: CrearSeccionInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const created = (await ctx.client.call(
      'local_wsmanagesections_create_sections',
      {
        courseid: args.course_id,
        position: args.position,
        number: 1,
      },
    )) as WsCreateSectionItem[] | undefined;

    const info = Array.isArray(created) ? created[0] : undefined;
    if (!info?.sectionid) {
      throw new MoodleWsError(
        `local_wsmanagesections_create_sections returned no section for course ${args.course_id}`,
        {
          code: 'MOODLE_WS_PLUGIN_ERROR',
          details: { course_id: args.course_id, response: created },
        },
      );
    }

    await ctx.client.call('local_wsmanagesections_update_sections', {
      courseid: args.course_id,
      sections: [
        {
          type: 'id',
          section: info.sectionid,
          name: args.name,
          summary: args.summary,
          summaryformat: 1,
          visible: args.visible ? 1 : 0,
        },
      ],
    });

    return toJsonResponse({
      section_id: info.sectionid,
      sectionnum: info.sectionnumber,
      name: args.name,
      visible: args.visible,
    });
  } catch (e) {
    ctx.logger.warn('crear_seccion.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
