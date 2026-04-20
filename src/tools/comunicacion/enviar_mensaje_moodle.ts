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
    recipients: z
      .array(z.number().int().positive())
      .min(1)
      .max(50)
      .describe('Moodle user ids to message. Max 50 per call.'),
    text: z.string().min(1).max(10_000),
    format: z.enum(['plain', 'html']).default('plain'),
  })
  .strict();

export type EnviarMensajeMoodleInput = z.infer<typeof InputSchema>;

/**
 * Send a private Moodle message (site-internal) to one or more users.
 * The bot account is always the sender; recipients see the message in
 * their Moodle inbox notifications.
 */
export function buildEnviarMensajeMoodleTool(): ToolDefinition<EnviarMensajeMoodleInput> {
  return {
    name: 'enviar_mensaje_moodle',
    description:
      'Send a private Moodle message to one or more user ids. Max 50 recipients per call. Uses core_message_send_instant_messages.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const enviarMensajeMoodleTool = buildEnviarMensajeMoodleTool();

async function execute(
  args: EnviarMensajeMoodleInput,
  ctx: ToolContext,
): Promise<ToolResponse> {
  try {
    const result = (await ctx.client.call('core_message_send_instant_messages', {
      messages: args.recipients.map((touserid) => ({
        touserid,
        text: args.text,
        textformat: args.format === 'html' ? 1 : 0,
      })),
    })) as Array<{ msgid: number; errormessage?: string }> | undefined;

    const items = Array.isArray(result) ? result : [];
    const ok = items.filter((i) => i.msgid > 0).length;
    const failed = items.filter((i) => i.msgid <= 0 || i.errormessage).length;

    return toJsonResponse({
      recipients_count: args.recipients.length,
      sent: ok,
      failed,
      results: items,
    });
  } catch (e) {
    ctx.logger.warn('enviar_mensaje_moodle.failed', {
      recipients_count: args.recipients.length,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
