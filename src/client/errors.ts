/**
 * Structured errors for Moodle WS interactions.
 *
 * Every error carries a stable `code` (MOODLE_WS_* / MOODLE_PLUGIN_*) and
 * optional `functionName` + `details`. `toClientPayload()` produces the
 * safe, serialisable object that is surfaced inside MCP tool responses —
 * stack traces never cross that boundary (CONTEXT §14.2).
 */

export interface MoodleErrorOptions {
  code?: string;
  functionName?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export interface MoodleErrorPayload {
  code: string;
  message: string;
  functionName?: string;
  details?: Record<string, unknown>;
}

export class MoodleWsError extends Error {
  readonly code: string;
  readonly functionName: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, opts: MoodleErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'MoodleWsError';
    this.code = opts.code ?? 'MOODLE_WS_ERROR';
    this.functionName = opts.functionName;
    this.details = opts.details;
  }

  toClientPayload(): MoodleErrorPayload {
    const payload: MoodleErrorPayload = {
      code: this.code,
      message: this.message,
    };
    if (this.functionName !== undefined) payload.functionName = this.functionName;
    if (this.details !== undefined) payload.details = this.details;
    return payload;
  }
}

export class MoodleTokenError extends MoodleWsError {
  constructor(
    message = 'Invalid or expired Moodle Web Services token',
    opts: Omit<MoodleErrorOptions, 'code'> = {},
  ) {
    super(message, { ...opts, code: 'MOODLE_WS_TOKEN_INVALID' });
    this.name = 'MoodleTokenError';
  }
}

export class MoodleTimeoutError extends MoodleWsError {
  readonly timeoutMs: number | undefined;

  constructor(
    message = 'Moodle Web Services request timed out',
    opts: Omit<MoodleErrorOptions, 'code'> & { timeoutMs?: number } = {},
  ) {
    const { timeoutMs, ...rest } = opts;
    super(message, { ...rest, code: 'MOODLE_WS_TIMEOUT' });
    this.name = 'MoodleTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class MoodlePluginMissingError extends MoodleWsError {
  readonly plugin: string;

  constructor(
    plugin: string,
    message?: string,
    opts: Omit<MoodleErrorOptions, 'code'> = {},
  ) {
    const msg =
      message ??
      `Required Moodle plugin is not installed: ${plugin}. ` +
        `Install it from https://moodle.org/plugins/ and restart Moodle.`;
    super(msg, { ...opts, code: 'MOODLE_PLUGIN_MISSING' });
    this.name = 'MoodlePluginMissingError';
    this.plugin = plugin;
  }
}

/**
 * Type guard for any error thrown by this MCP's Moodle layer.
 */
export function isMoodleWsError(e: unknown): e is MoodleWsError {
  return e instanceof MoodleWsError;
}
