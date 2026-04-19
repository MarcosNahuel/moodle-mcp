import type { z } from 'zod';
import type { MoodleClient } from '../client/moodle-client.js';
import type { Logger } from '../utils/logger.js';
import { isMoodleWsError, MoodleWsError } from '../client/errors.js';

/**
 * Shared tool contract. Every tool in `src/tools/*.ts` exports a value of
 * this shape so the MCP server can register them uniformly.
 */
export interface ToolContext {
  client: MoodleClient;
  logger: Logger;
}

export interface ToolTextContent {
  type: 'text';
  text: string;
}

export interface ToolResponse {
  content: ToolTextContent[];
  isError?: boolean;
  meta?: Record<string, unknown>;
}

export interface ToolDefinition<TInput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  handler(args: TInput, ctx: ToolContext): Promise<ToolResponse>;
}

/**
 * Convert any thrown error into the standard MCP error response shape.
 * {@link MoodleWsError}s are surfaced with full structured context in
 * `meta`; unknown errors become generic `MOODLE_WS_ERROR` responses with
 * the bare message (stack traces never cross this boundary — CONTEXT §14.2).
 */
export function toErrorResponse(e: unknown): ToolResponse {
  if (isMoodleWsError(e)) {
    return {
      isError: true,
      content: [{ type: 'text', text: e.message }],
      meta: { ...e.toClientPayload() },
    };
  }
  const err = e instanceof Error ? e : new MoodleWsError(String(e));
  return {
    isError: true,
    content: [{ type: 'text', text: err.message }],
    meta: { code: 'MOODLE_WS_ERROR', message: err.message },
  };
}

export function toJsonResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}
