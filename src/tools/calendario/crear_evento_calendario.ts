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
    course_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Attach the event to a course. Omit for user or site events.'),
    groupid: z.number().int().nonnegative().optional(),
    name: z.string().min(1).max(254),
    description: z.string().default(''),
    eventtype: z
      .enum(['user', 'group', 'course', 'category', 'site'])
      .default('course'),
    timestart: z.number().int().positive().describe('Unix timestamp for the event start.'),
    timeduration: z.number().int().nonnegative().default(3600).describe('Seconds. 0 = no duration.'),
    location: z.string().default(''),
    repeat_count: z
      .number()
      .int()
      .min(0)
      .max(52)
      .default(0)
      .describe('If >0, Moodle creates this many repeated events at 7-day intervals starting from timestart.'),
  })
  .strict();

export type CrearEventoCalendarioInput = z.infer<typeof InputSchema>;

interface WsCreatedEvent {
  id: number;
  name: string;
  timestart: number;
  eventtype: string;
}

export function buildCrearEventoCalendarioTool(): ToolDefinition<CrearEventoCalendarioInput> {
  return {
    name: 'crear_evento_calendario',
    description:
      'Create a calendar event. Default eventtype=course. Set repeat_count>0 to create weekly recurrences. Returns the created event id and metadata.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const crearEventoCalendarioTool = buildCrearEventoCalendarioTool();

async function execute(
  args: CrearEventoCalendarioInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const event: Record<string, unknown> = {
      name: args.name,
      description: args.description,
      format: 1,
      timestart: args.timestart,
      timeduration: args.timeduration,
      location: args.location,
      eventtype: args.eventtype,
      repeats: args.repeat_count,
    };
    if (args.course_id !== undefined) event.courseid = args.course_id;
    if (args.groupid !== undefined) event.groupid = args.groupid;

    const result = (await ctx.client.call('core_calendar_create_calendar_events', {
      events: [event],
    })) as { events?: WsCreatedEvent[] } | undefined;

    const created = Array.isArray(result?.events) ? result.events : [];

    return toJsonResponse({
      created_count: created.length,
      events: created.map((e) => ({
        event_id: e.id,
        name: e.name,
        timestart: e.timestart,
        eventtype: e.eventtype,
      })),
    });
  } catch (e) {
    ctx.logger.warn('crear_evento_calendario.failed', {
      name: args.name,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
