import { LOG_LEVELS, type LogLevel } from '../config.js';

/**
 * Structured JSON-per-line logger.
 *
 * Writes each record as a single JSON object on its own line, to stderr by
 * default. stdout is reserved for the MCP JSON-RPC channel — nothing else
 * may touch it (CONTEXT §13.1).
 *
 * Every log record has at least: `ts` (ISO-8601), `level`, `msg`. Extra
 * fields are merged in via the `fields` argument or via `child(baseFields)`
 * for per-scope context (e.g. a tool handler that wants every log line to
 * carry `{ tool: "publicar_ficha_clase", ficha_id: "..." }`).
 *
 * Secrets listed in `redact` are replaced by `***` wherever they appear
 * across the whole record, including nested fields — the redactor walks
 * strings, arrays and plain objects.
 */

export type { LogLevel };

export type LogFields = Record<string, unknown>;

export interface Logger {
  error(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  debug(msg: string, fields?: LogFields): void;
  child(baseFields: LogFields): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: (line: string) => void;
  clock?: () => string;
  /** Strings to replace by `***` in every emitted line. Typically a WS token. */
  redact?: readonly string[];
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function defaultSink(line: string): void {
  process.stderr.write(`${line}\n`);
}

function defaultClock(): string {
  return new Date().toISOString();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deepRedact(value: unknown, secrets: readonly string[]): unknown {
  const active = secrets.filter((s) => s.length > 0);
  if (active.length === 0) return value;
  const patterns = active.map((s) => new RegExp(escapeRegex(s), 'g'));

  const walk = (v: unknown, seen: WeakSet<object>): unknown => {
    if (typeof v === 'string') {
      let out = v;
      for (const re of patterns) out = out.replace(re, '***');
      return out;
    }
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[Circular]';
    seen.add(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, seen));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x, seen);
    return out;
  };

  return walk(value, new WeakSet());
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, (_k, v: unknown) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
  } catch (e) {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'logger: failed to stringify record',
      error: (e as Error).message,
    });
  }
}

function build(opts: LoggerOptions, baseFields: LogFields): Logger {
  const level = opts.level ?? 'info';
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`Invalid log level: ${level}`);
  }
  const threshold = LEVEL_PRIORITY[level];
  const sink = opts.sink ?? defaultSink;
  const clock = opts.clock ?? defaultClock;
  const secrets = opts.redact ?? [];

  function emit(lvl: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_PRIORITY[lvl] > threshold) return;
    const record: Record<string, unknown> = {
      ts: clock(),
      level: lvl,
      msg,
      ...baseFields,
      ...(fields ?? {}),
    };
    const redacted = deepRedact(record, secrets);
    sink(safeStringify(redacted));
  }

  return {
    error: (m, f) => emit('error', m, f),
    warn: (m, f) => emit('warn', m, f),
    info: (m, f) => emit('info', m, f),
    debug: (m, f) => emit('debug', m, f),
    child: (bf) => build(opts, { ...baseFields, ...bf }),
  };
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  return build(opts, {});
}

/**
 * No-op logger for tests and for modules that want a default.
 */
export const nullLogger: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  child: () => nullLogger,
};
