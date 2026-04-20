import { createHash } from 'node:crypto';

/**
 * Build a stable `idnumber` for Moodle entities created by this MCP.
 *
 * We reserve the `mcp:` prefix so operators can easily filter MCP-managed
 * objects in Moodle admin and prevent collisions with manually created ones.
 *
 * @example
 * buildIdnumber('course', 'italiano-a1-2026')
 *   // => "mcp:course:91f82a17c9de31a6b9e0"
 */
export function buildIdnumber(kind: IdnumberKind, key: string): string {
  const hash = createHash('sha1').update(`${kind}|${key}`).digest('hex').slice(0, 20);
  return `mcp:${kind}:${hash}`;
}

export type IdnumberKind =
  | 'course'
  | 'section'
  | 'module'
  | 'quiz'
  | 'question-category'
  | 'question'
  | 'user'
  | 'group'
  | 'badge'
  | 'calendar-event';

/**
 * Check a string is already a valid MCP idnumber (i.e. starts with `mcp:`).
 * Useful for guarding fallback paths that should reject non-MCP-managed inputs.
 */
export function isMcpIdnumber(value: string): boolean {
  return /^mcp:[a-z-]+:[a-f0-9]{8,64}$/.test(value);
}

/**
 * Clamp-safe number coerce for Moodle WS responses. Moodle sometimes returns
 * numeric fields as strings (notably `courseid`, `userid`, `quizid`).
 * This helper normalises to finite integers, throwing on NaN/Infinity.
 */
export function coerceInt(value: unknown, field: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`Expected integer for ${field}, got ${value}`);
    }
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`Expected integer-parseable string for ${field}, got ${value}`);
    }
    return n;
  }
  throw new Error(`Expected integer for ${field}, got ${typeof value}`);
}
