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
    new_password: z
      .string()
      .min(8)
      .optional()
      .describe(
        'If omitted, generates a random strong password and returns it in the payload. The user should be told to change it on first login.',
      ),
  })
  .strict();

export type ResetPasswordInput = z.infer<typeof InputSchema>;

function randomPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + '!A1';
}

/**
 * Set a user's password via core_user_update_users.
 *
 * Notes:
 *  - The password is logged nowhere. It is returned ONCE in the tool
 *    payload and it is the caller's job to get it to the user
 *    (WhatsApp, email, etc.) and then forget it.
 *  - Moodle password policy (min length, symbols, etc.) is site-configured.
 *    The default generated password meets Moodle's typical "secure"
 *    policy; if the site has stricter rules, pass `new_password`
 *    explicitly.
 */
export function buildResetPasswordTool(): ToolDefinition<ResetPasswordInput> {
  return {
    name: 'reset_password',
    description:
      'Reset a user\'s password. If new_password is omitted, generates a random strong one and returns it (you MUST forward to the user out-of-band).',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const resetPasswordTool = buildResetPasswordTool();

async function execute(args: ResetPasswordInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const password = args.new_password ?? randomPassword();
    await ctx.client.call('core_user_update_users', {
      users: [
        {
          id: args.user_id,
          password,
        },
      ],
    });

    return toJsonResponse({
      user_id: args.user_id,
      password,
      generated: args.new_password === undefined,
      notice: 'Password is returned once. Forward it to the user via a secure channel and discard.',
    });
  } catch (e) {
    ctx.logger.warn('reset_password.failed', {
      user_id: args.user_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
