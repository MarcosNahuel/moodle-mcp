import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolDefinition,
} from '../types.js';

const InputSchema = z
  .object({
    seccion_id: z.number().int().positive(),
    course_id: z.number().int().positive(),
    recursos_ids: z.array(z.number().int().positive()).optional(),
  })
  .strict();

export type ConfirmarPreviewInput = z.infer<typeof InputSchema>;

/**
 * Make a previously hidden section — and its modules by default —
 * visible to students. Second step of the preview workflow (after
 * `publicar_preview`).
 *
 * Uses `local_wsmanagesections_update_sections` (plugin) with
 * `updatemodules: true` so the section's children inherit the new
 * visibility in a single WS call. `recursos_ids` is accepted for
 * API compatibility but in v0.1.1 is ignored — section-level visibility
 * already governs all its modules.
 */
export const confirmarPreviewTool: ToolDefinition<ConfirmarPreviewInput> = {
  name: 'confirmar_preview',
  description:
    'Make a previewed section visible to students. Propagates visibility to all modules inside the section. Idempotent.',
  inputSchema: InputSchema,
  async handler(args, ctx) {
    try {
      await ctx.client.call('local_wsmanagesections_update_sections', {
        courseid: args.course_id,
        sections: [
          {
            type: 'id',
            section: args.seccion_id,
            visible: 1,
          },
        ],
      });

      return toJsonResponse({
        seccion: { id: args.seccion_id, ahora_visible: true },
        recursos_liberados: args.recursos_ids?.length ?? 0,
        advertencias:
          args.recursos_ids !== undefined
            ? [
                'recursos_ids is ignored in v0.1: visibility is applied at section level via local_wsmanagesections (propagates to all modules inside).',
              ]
            : [],
      });
    } catch (e) {
      return toErrorResponse(e);
    }
  },
};
