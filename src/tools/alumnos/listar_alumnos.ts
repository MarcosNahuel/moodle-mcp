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
    role: z
      .enum(['student', 'teacher', 'editingteacher', 'manager', 'any'])
      .default('student'),
    limit: z.number().int().min(1).max(500).default(200),
  })
  .strict();

export type ListarAlumnosInput = z.infer<typeof InputSchema>;

const ROLE_SHORTNAMES: Record<string, string> = {
  student: 'student',
  teacher: 'teacher',
  editingteacher: 'editingteacher',
  manager: 'manager',
};

interface EnrolledUser {
  id: number;
  fullname: string;
  email?: string;
  username?: string;
  firstaccess?: number;
  lastaccess?: number;
  roles?: Array<{ roleid: number; shortname: string; name: string }>;
  groups?: Array<{ id: number; name: string }>;
}

/**
 * List enrolled users in a course, optionally filtered by role shortname.
 */
export function buildListarAlumnosTool(): ToolDefinition<ListarAlumnosInput> {
  return {
    name: 'listar_alumnos',
    description:
      'List enrolled users in a course. Filter by role shortname (default: student). Returns id, fullname, email, lastaccess, roles and groups per user.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const listarAlumnosTool = buildListarAlumnosTool();

async function execute(args: ListarAlumnosInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const raw = (await ctx.client.call('core_enrol_get_enrolled_users', {
      courseid: args.course_id,
    })) as EnrolledUser[] | undefined;

    const users = Array.isArray(raw) ? raw : [];
    const filtered =
      args.role === 'any'
        ? users
        : users.filter((u) =>
            (u.roles ?? []).some((r) => r.shortname === ROLE_SHORTNAMES[args.role]),
          );

    const limited = filtered.slice(0, args.limit).map((u) => ({
      user_id: u.id,
      fullname: u.fullname,
      email: u.email ?? null,
      username: u.username ?? null,
      firstaccess: u.firstaccess ?? null,
      lastaccess: u.lastaccess ?? null,
      roles: (u.roles ?? []).map((r) => r.shortname),
      groups: (u.groups ?? []).map((g) => ({ id: g.id, name: g.name })),
    }));

    return toJsonResponse({
      course_id: args.course_id,
      role_filter: args.role,
      total_matched: filtered.length,
      returned: limited.length,
      users: limited,
    });
  } catch (e) {
    ctx.logger.warn('listar_alumnos.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
