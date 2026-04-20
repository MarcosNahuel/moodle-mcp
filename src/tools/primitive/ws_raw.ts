import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolDefinition,
} from '../types.js';

const WsRawInputSchema = z
  .object({
    function_name: z
      .string()
      .min(1, 'function_name is required')
      .regex(/^[a-z][a-z0-9_]*$/i, 'function_name must be a Moodle WS function identifier'),
    params: z.record(z.unknown()).optional().default({}),
  })
  .strict();

export type WsRawInput = z.infer<typeof WsRawInputSchema>;

/**
 * Low-level primitive: call any Moodle Web Services function directly.
 * Escape hatch for anything not covered by higher-level facades.
 *
 * The client doing the call is responsible for passing Moodle-shaped
 * parameters. Rate limiting, retry, timeout and token redaction all apply
 * via the underlying {@link MoodleClient}.
 */
export const wsRawTool: ToolDefinition<WsRawInput> = {
  name: 'ws_raw',
  description:
    'Escape hatch: call any Moodle Web Services function with arbitrary parameters. Returns `{ data }` on success, structured `meta.code` + `isError: true` on failure. Prefer high-level facades when they cover your use case.',
  inputSchema: WsRawInputSchema,
  async handler(args, ctx) {
    ctx.logger.debug('ws_raw.call', {
      function_name: args.function_name,
      param_keys: Object.keys(args.params),
    });
    try {
      const data = await ctx.client.call(args.function_name, args.params);
      return toJsonResponse({ data });
    } catch (e) {
      ctx.logger.warn('ws_raw.failed', {
        function_name: args.function_name,
        error_kind: (e as Error)?.name,
      });
      return toErrorResponse(e);
    }
  },
};
