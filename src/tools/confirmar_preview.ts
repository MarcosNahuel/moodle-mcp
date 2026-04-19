import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolDefinition,
} from './types.js';

const InputSchema = z
  .object({
    seccion_id: z.number().int().positive(),
    recursos_ids: z.array(z.number().int().positive()).optional(),
  })
  .strict();

export type ConfirmarPreviewInput = z.infer<typeof InputSchema>;

/**
 * Make a previously hidden section — and optionally a specific subset of
 * its modules — visible to students. This is the second step of the
 * preview workflow (after `publicar_preview`).
 *
 * If `recursos_ids` is omitted, all modules in the section are made visible.
 */
export const confirmarPreviewTool: ToolDefinition<ConfirmarPreviewInput> = {
  name: 'confirmar_preview',
  description:
    'Make a previewed section (and optionally a subset of its modules) visible to students. Idempotent.',
  inputSchema: InputSchema,
  async handler(args, ctx) {
    try {
      await ctx.client.call('core_course_edit_section', {
        action: 'show',
        id: args.seccion_id,
      });

      let recursos_liberados = 0;
      if (args.recursos_ids !== undefined) {
        for (const id of args.recursos_ids) {
          await ctx.client.call('core_course_edit_module', {
            action: 'show',
            id,
          });
          recursos_liberados += 1;
        }
      }

      return toJsonResponse({
        seccion: { id: args.seccion_id, ahora_visible: true },
        recursos_liberados,
      });
    } catch (e) {
      return toErrorResponse(e);
    }
  },
};
