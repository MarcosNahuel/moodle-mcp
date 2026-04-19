import { createHash } from 'node:crypto';

/**
 * Prefix used to tag every Moodle `idnumber` managed by this MCP.
 * Lets operators grep / list / clean up MCP-owned resources in Moodle.
 */
export const IDNUMBER_PREFIX = 'mcp:';

/** Length of the hex slice appended after the prefix. 24 hex chars = 96 bits of entropy. */
export const IDNUMBER_HASH_LEN = 24;

/**
 * Build a stable Moodle `idnumber` for a component of a Ficha, based on
 * `sha1(fichaId + "|" + componentId)` truncated to {@link IDNUMBER_HASH_LEN}
 * hex characters and prefixed with `mcp:`.
 *
 * Determinism of this function is what makes every write an upsert — the same
 * Ficha maps to the same `idnumber` forever.
 *
 * Inputs are normalised: whitespace around strings is trimmed and the empty
 * string is rejected (empty inputs would yield a hash that collides across
 * different Fichas — a real correctness risk, not a style issue).
 *
 * @see CONTEXT.md §8.1
 * @see AGENT_LAUNCH.md §2 decision 4
 */
export function buildIdnumber(fichaId: string, componentId: string): string {
  const ficha = assertNonEmpty(fichaId, 'fichaId');
  const comp = assertNonEmpty(componentId, 'componentId');
  const hash = createHash('sha1')
    .update(`${ficha}|${comp}`, 'utf8')
    .digest('hex')
    .slice(0, IDNUMBER_HASH_LEN);
  return `${IDNUMBER_PREFIX}${hash}`;
}

/**
 * Shortcut for the Moodle section that holds a whole Ficha. Uses the reserved
 * component id `"section"`.
 */
export function buildSectionIdnumber(fichaId: string): string {
  return buildIdnumber(fichaId, 'section');
}

/**
 * Type guard: returns true iff `value` looks like an idnumber this MCP would
 * have produced (has the correct prefix and hex tail of the expected length).
 */
export function isMcpIdnumber(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!value.startsWith(IDNUMBER_PREFIX)) return false;
  const tail = value.slice(IDNUMBER_PREFIX.length);
  if (tail.length !== IDNUMBER_HASH_LEN) return false;
  return /^[0-9a-f]+$/.test(tail);
}

function assertNonEmpty(value: string, name: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(`${name} must not be empty`);
  }
  return trimmed;
}
