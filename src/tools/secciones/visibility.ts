import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';

/**
 * Shared shape + implementation for `ocultar_seccion` and `liberar_seccion`.
 * Keeping them as two distinct tool names (rather than a generic "toggle")
 * makes intent explicit in agent transcripts — "ocultar la sección 3" vs
 * "liberar la sección 3" — which matters in a classroom workflow where the
 * distinction has student-facing consequences.
 */

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_id: z.number().int().positive(),
  })
  .strict();

export type SeccionVisibilityInput = z.infer<typeof InputSchema>;

async function setSectionVisible(
  ctx: ToolContext,
  args: SeccionVisibilityInput,
  visible: boolean,
  logName: string,
): Promise<ToolResponse> {
  try {
    await ctx.client.call('local_wsmanagesections_update_sections', {
      courseid: args.course_id,
      sections: [
        {
          type: 'id',
          section: args.section_id,
          visible: visible ? 1 : 0,
        },
      ],
    });
    return toJsonResponse({
      section_id: args.section_id,
      visible,
    });
  } catch (e) {
    ctx.logger.warn(`${logName}.failed`, {
      course_id: args.course_id,
      section_id: args.section_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}

export function buildOcultarSeccionTool(): ToolDefinition<SeccionVisibilityInput> {
  return {
    name: 'ocultar_seccion',
    description:
      'Hide a course section (and its modules) from students. Uses local_wsmanagesections.',
    inputSchema: InputSchema,
    handler: (args, ctx) => setSectionVisible(ctx, args, false, 'ocultar_seccion'),
  };
}

export function buildLiberarSeccionTool(): ToolDefinition<SeccionVisibilityInput> {
  return {
    name: 'liberar_seccion',
    description:
      'Make a course section visible to students (reverse of ocultar_seccion).',
    inputSchema: InputSchema,
    handler: (args, ctx) => setSectionVisible(ctx, args, true, 'liberar_seccion'),
  };
}

export const ocultarSeccionTool = buildOcultarSeccionTool();
export const liberarSeccionTool = buildLiberarSeccionTool();
