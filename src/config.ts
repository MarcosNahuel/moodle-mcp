import { z } from 'zod';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const ConfigSchemaBase = z.object({
  moodleUrl: z.string().url({ message: 'MOODLE_URL must be a valid URL' }),
  moodleWsToken: z.string().min(1, { message: 'MOODLE_WS_TOKEN must be a non-empty string' }),
  timeoutMs: z.number().int().positive().default(30_000),
  maxRetries: z.number().int().min(0).default(3),
  rateLimitPerSec: z.number().positive().default(10),
  logLevel: z.enum(LOG_LEVELS).default('info'),
});

export type MoodleConfig = z.infer<typeof ConfigSchemaBase>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function coerceNumber(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new ConfigError(`${name} must be a finite number, got: ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * Load and validate moodle-mcp configuration from environment variables.
 *
 * Required: MOODLE_URL, MOODLE_WS_TOKEN.
 * Optional: MOODLE_WS_TIMEOUT_MS, MOODLE_WS_MAX_RETRIES, MOODLE_WS_RATE_LIMIT_PER_SEC, MCP_LOG_LEVEL.
 * Escape hatch: MOODLE_ALLOW_INSECURE=true permits non-HTTPS URLs (dev only).
 *
 * Throws {@link ConfigError} with a human-readable message on any failure —
 * never a raw zod error or stack trace.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): MoodleConfig {
  const missing: string[] = [];
  if (!env.MOODLE_URL) missing.push('MOODLE_URL');
  if (!env.MOODLE_WS_TOKEN) missing.push('MOODLE_WS_TOKEN');
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Set them before launching moodle-mcp.`,
    );
  }

  const allowInsecure = env.MOODLE_ALLOW_INSECURE === 'true';
  const raw: Record<string, unknown> = {
    moodleUrl: env.MOODLE_URL,
    moodleWsToken: env.MOODLE_WS_TOKEN,
  };
  const t = coerceNumber(env.MOODLE_WS_TIMEOUT_MS, 'MOODLE_WS_TIMEOUT_MS');
  if (t !== undefined) raw.timeoutMs = t;
  const r = coerceNumber(env.MOODLE_WS_MAX_RETRIES, 'MOODLE_WS_MAX_RETRIES');
  if (r !== undefined) raw.maxRetries = r;
  const rl = coerceNumber(env.MOODLE_WS_RATE_LIMIT_PER_SEC, 'MOODLE_WS_RATE_LIMIT_PER_SEC');
  if (rl !== undefined) raw.rateLimitPerSec = rl;
  if (env.MCP_LOG_LEVEL) raw.logLevel = env.MCP_LOG_LEVEL.toLowerCase();

  const Schema = allowInsecure
    ? ConfigSchemaBase
    : ConfigSchemaBase.extend({
        moodleUrl: ConfigSchemaBase.shape.moodleUrl.refine(
          (u) => u.startsWith('https://'),
          {
            message:
              'MOODLE_URL must use HTTPS (set MOODLE_ALLOW_INSECURE=true to override in dev)',
          },
        ),
      });

  const result = Schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  · ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Invalid configuration:\n${issues}`);
  }
  return result.data;
}
