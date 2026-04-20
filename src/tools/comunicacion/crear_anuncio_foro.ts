import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';
import { MoodleWsError } from '../../client/errors.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    subject: z.string().min(1).max(254),
    message: z.string().min(1),
    forum_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Specific forum id. If omitted, uses the course "Announcements" (news) forum, or the first forum in the course.',
      ),
    pin: z.boolean().default(false),
    format: z.enum(['plain', 'html']).default('html'),
  })
  .strict();

export type CrearAnuncioForoInput = z.infer<typeof InputSchema>;

interface WsForum {
  id: number;
  course: number;
  type: string;
  name: string;
}

/**
 * Post a new discussion to a course forum. If no forum_id is given,
 * picks the course "Announcements" (news) forum — the default forum
 * that Moodle creates automatically and where teachers post
 * course-wide notifications.
 */
export function buildCrearAnuncioForoTool(): ToolDefinition<CrearAnuncioForoInput> {
  return {
    name: 'crear_anuncio_foro',
    description:
      'Post a new discussion in a course forum. If forum_id is omitted, uses the course Announcements (type=news) forum.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const crearAnuncioForoTool = buildCrearAnuncioForoTool();

async function execute(args: CrearAnuncioForoInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    let forumid = args.forum_id;
    if (forumid === undefined) {
      const forums = (await ctx.client.call('mod_forum_get_forums_by_courses', {
        courseids: [args.course_id],
      })) as WsForum[] | undefined;

      if (!Array.isArray(forums) || forums.length === 0) {
        throw new MoodleWsError(
          `Course ${args.course_id} has no forums. Pass forum_id explicitly.`,
          { code: 'MOODLE_WS_NO_FORUM', details: { course_id: args.course_id } },
        );
      }
      const news = forums.find((f) => f.type === 'news');
      forumid = news?.id ?? forums[0]!.id;
    }

    const result = (await ctx.client.call('mod_forum_add_discussion', {
      forumid,
      subject: args.subject,
      message: args.message,
      options: [
        { name: 'discussionpinned', value: args.pin ? 1 : 0 },
        { name: 'messageformat', value: args.format === 'html' ? 1 : 0 },
      ],
    })) as { discussionid: number } | undefined;

    return toJsonResponse({
      course_id: args.course_id,
      forum_id: forumid,
      discussion_id: result?.discussionid ?? null,
      pinned: args.pin,
    });
  } catch (e) {
    ctx.logger.warn('crear_anuncio_foro.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
