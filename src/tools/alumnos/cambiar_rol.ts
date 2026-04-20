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
    user_id: z.number().int().positive(),
    new_role: z.enum(['student', 'teacher', 'editingteacher', 'manager']),
    context_level: z
      .enum(['course'])
      .default('course')
      .describe('Only course-level role assignment is supported in v0.5.'),
  })
  .strict();

export type CambiarRolInput = z.infer<typeof InputSchema>;

const ROLE_IDS: Record<string, number> = {
  student: 5,
  teacher: 4,
  editingteacher: 3,
  manager: 1,
};

/**
 * Assign a role to a user in a course context via core_role_assign_roles.
 * Does NOT unassign previous roles — Moodle keeps multiple role
 * assignments per user/context. If Alicia's intent is "replace the
 * role", she should first call dar_baja + matricular with the new role.
 */
export function buildCambiarRolTool(): ToolDefinition<CambiarRolInput> {
  return {
    name: 'cambiar_rol',
    description:
      'Assign a course-level role to a user (student / teacher / editingteacher / manager). Does NOT unassign previous roles — Moodle supports multiple roles per user per context.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const cambiarRolTool = buildCambiarRolTool();

async function execute(args: CambiarRolInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const roleid = ROLE_IDS[args.new_role]!;
    // Moodle role assign expects contextid, not course_id. We resolve the
    // course context via a lightweight call to get_courses_by_field.
    const courseInfo = (await ctx.client.call('core_course_get_courses_by_field', {
      field: 'id',
      value: args.course_id,
    })) as { courses?: Array<{ id: number }> } | undefined;

    if (!courseInfo?.courses?.length) {
      throw new Error(`course ${args.course_id} not found`);
    }

    await ctx.client.call('core_role_assign_roles', {
      assignments: [
        {
          roleid,
          userid: args.user_id,
          contextlevel: 'course',
          instanceid: args.course_id,
        },
      ],
    });

    return toJsonResponse({
      course_id: args.course_id,
      user_id: args.user_id,
      role: args.new_role,
      roleid,
    });
  } catch (e) {
    ctx.logger.warn('cambiar_rol.failed', {
      course_id: args.course_id,
      user_id: args.user_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
