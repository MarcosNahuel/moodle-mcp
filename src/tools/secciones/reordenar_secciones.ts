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
    order: z
      .array(
        z.object({
          section_id: z.number().int().positive(),
          position: z.number().int().min(0),
        }),
      )
      .min(1)
      .describe(
        'Desired ordering as an array of {section_id, position}. ' +
          'Position is 0-indexed (0 = first after General). ' +
          'Sections not in the array keep their current position but may shift.',
      ),
  })
  .strict();

export type ReordenarSeccionesInput = z.infer<typeof InputSchema>;

/**
 * Change the position of one or more sections in a course by sending a
 * single batched `local_wsmanagesections_update_sections` call with the
 * `position` field per section.
 *
 * Moodle recalculates sibling positions when we set a section to a new
 * position; passing the full desired ordering in one call keeps the
 * resulting layout deterministic (as opposed to N sequential single-
 * section moves which could interleave with each other's recalc).
 */
export function buildReordenarSeccionesTool(): ToolDefinition<ReordenarSeccionesInput> {
  return {
    name: 'reordenar_secciones',
    description:
      'Reorder sections in a course. Accepts an array of {section_id, position} and applies them in one batched update_sections call.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const reordenarSeccionesTool = buildReordenarSeccionesTool();

async function execute(args: ReordenarSeccionesInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const sections = args.order.map((item) => ({
      type: 'id' as const,
      section: item.section_id,
      position: item.position,
    }));

    await ctx.client.call('local_wsmanagesections_update_sections', {
      courseid: args.course_id,
      sections,
    });

    return toJsonResponse({
      course_id: args.course_id,
      reordered: args.order.length,
    });
  } catch (e) {
    ctx.logger.warn('reordenar_secciones.failed', {
      course_id: args.course_id,
      count: args.order.length,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
