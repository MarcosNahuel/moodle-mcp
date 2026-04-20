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
    user_id: z.number().int().positive(),
    course_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('If set, only returns badges awarded in this course. Otherwise site-wide.'),
  })
  .strict();

export type ListarBadgesUsuarioInput = z.infer<typeof InputSchema>;

interface WsBadge {
  id: number;
  name: string;
  description: string;
  badgeurl: string;
  dateissued?: number;
  issuername?: string;
  courseid?: number;
}

/**
 * List badges earned by a user. Only read path available in the
 * current service: core_badges_get_user_badges. Awarding badges and
 * managing course badges need additional plugin endpoints and are
 * deferred to v0.6 (see L13 in italiacia_whatsapp/moodle/decisiones-y-lecciones.md).
 */
export function buildListarBadgesUsuarioTool(): ToolDefinition<ListarBadgesUsuarioInput> {
  return {
    name: 'listar_badges_usuario',
    description:
      'List badges earned by a user. Optionally filtered by course_id. Read-only — awarding badges is deferred to v0.6.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const listarBadgesUsuarioTool = buildListarBadgesUsuarioTool();

async function execute(
  args: ListarBadgesUsuarioInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const params: Record<string, unknown> = { userid: args.user_id };
    if (args.course_id !== undefined) params.courseid = args.course_id;

    const raw = (await ctx.client.call('core_badges_get_user_badges', params)) as
      | { badges?: WsBadge[] }
      | undefined;

    const badges = (raw?.badges ?? []).map((b) => ({
      badge_id: b.id,
      name: b.name,
      description: b.description,
      badge_url: b.badgeurl,
      issued_at: b.dateissued ?? null,
      issuer_name: b.issuername ?? null,
      course_id: b.courseid ?? null,
    }));

    return toJsonResponse({
      user_id: args.user_id,
      course_filter: args.course_id ?? null,
      count: badges.length,
      badges,
    });
  } catch (e) {
    ctx.logger.warn('listar_badges_usuario.failed', {
      user_id: args.user_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
