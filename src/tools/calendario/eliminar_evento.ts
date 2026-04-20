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
    event_ids: z.array(z.number().int().positive()).min(1),
    delete_repeats: z
      .boolean()
      .default(false)
      .describe('If true, deletes all repeat instances of the event(s) too.'),
  })
  .strict();

export type EliminarEventoInput = z.infer<typeof InputSchema>;

export function buildEliminarEventoTool(): ToolDefinition<EliminarEventoInput> {
  return {
    name: 'eliminar_evento',
    description:
      'Delete one or more calendar events. Set delete_repeats=true to remove repeat instances as well.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const eliminarEventoTool = buildEliminarEventoTool();

async function execute(args: EliminarEventoInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    await ctx.client.call('core_calendar_delete_calendar_events', {
      events: args.event_ids.map((eventid) => ({
        eventid,
        repeat: args.delete_repeats ? 1 : 0,
      })),
    });

    return toJsonResponse({
      deleted_count: args.event_ids.length,
      event_ids: args.event_ids,
      including_repeats: args.delete_repeats,
    });
  } catch (e) {
    ctx.logger.warn('eliminar_evento.failed', {
      count: args.event_ids.length,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
