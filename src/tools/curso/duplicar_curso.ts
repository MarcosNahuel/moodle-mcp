import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { MoodleWsError } from '../../client/errors.js';
import { buildIdnumber } from '../_common/helpers.js';

const InputSchema = z
  .object({
    source_course_id: z.number().int().positive(),
    new_fullname: z.string().min(1).max(254),
    new_shortname: z.string().min(1).max(100),
    new_idnumber_slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, { message: 'slug must be lowercase kebab-case alnum' }),
    categoryid: z.number().int().positive().default(1),
    visible: z.boolean().default(false),
    /** Pass-through Moodle flags. Defaults mirror the typical "clone for next cohort" intent. */
    options: z
      .object({
        users: z.boolean().default(false).describe('Copy enrolled users'),
        role_assignments: z.boolean().default(false).describe('Copy role assignments'),
        activities: z.boolean().default(true).describe('Copy activity modules'),
        blocks: z.boolean().default(true).describe('Copy side-blocks'),
        filters: z.boolean().default(true).describe('Copy active filters'),
        comments: z.boolean().default(false).describe('Copy user comments'),
        badges: z.boolean().default(false).describe('Copy badges'),
        calendarevents: z.boolean().default(false).describe('Copy calendar events'),
        userscompletion: z.boolean().default(false).describe('Copy completion records'),
        logs: z.boolean().default(false).describe('Copy logs (usually large)'),
        grade_histories: z.boolean().default(false).describe('Copy grade histories'),
      })
      .strict()
      .default({}),
  })
  .strict();

export type DuplicarCursoInput = z.infer<typeof InputSchema>;

interface WsDuplicateResponse {
  id: number;
  shortname: string;
  fullname: string;
}

/**
 * Duplicate an existing course into a new one via
 * core_course_duplicate_course. Useful for cloning a curriculum into
 * the next cohort/year without copying student data.
 *
 * Note: duplicate is a heavy operation — Moodle runs it through the
 * backup/restore subsystem. For large courses expect multi-second
 * latency. The MCP does NOT stream progress; callers that need live
 * feedback should poll course_get_courses_by_field on the new idnumber.
 */
export function buildDuplicarCursoTool(): ToolDefinition<DuplicarCursoInput> {
  return {
    name: 'duplicar_curso',
    description:
      'Clone a course into a new one (backup+restore under the hood). Defaults copy activities/blocks/filters, NOT users/enrolments/grades. New course is hidden by default.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const duplicarCursoTool = buildDuplicarCursoTool();

async function execute(args: DuplicarCursoInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const newIdnumber = buildIdnumber('course', args.new_idnumber_slug);

    // Moodle's duplicate WS takes the options as an array of {name, value}.
    const optsPayload = Object.entries(args.options).map(([name, value]) => ({
      name,
      value: value ? 1 : 0,
    }));

    const result = (await ctx.client.call('core_course_duplicate_course', {
      courseid: args.source_course_id,
      fullname: args.new_fullname,
      shortname: args.new_shortname,
      categoryid: args.categoryid,
      visible: args.visible ? 1 : 0,
      options: optsPayload,
    })) as WsDuplicateResponse | undefined;

    if (!result?.id) {
      throw new MoodleWsError(
        'core_course_duplicate_course returned no new course id',
        { code: 'MOODLE_WS_UNEXPECTED', details: { response: result } },
      );
    }

    // Stamp the new course with our idnumber so callers can find it.
    await ctx.client.call('core_course_update_courses', {
      courses: [{ id: result.id, idnumber: newIdnumber }],
    });

    return toJsonResponse({
      source_course_id: args.source_course_id,
      new_course_id: result.id,
      new_shortname: result.shortname,
      new_idnumber: newIdnumber,
      visible: args.visible,
    });
  } catch (e) {
    ctx.logger.warn('duplicar_curso.failed', {
      source_course_id: args.source_course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
