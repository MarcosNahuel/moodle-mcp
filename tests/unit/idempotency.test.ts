import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildIdnumber,
  buildSectionIdnumber,
  isMcpIdnumber,
  IDNUMBER_PREFIX,
  IDNUMBER_HASH_LEN,
} from '../../src/utils/idempotency.js';

function expectedSha1Slice(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex').slice(0, IDNUMBER_HASH_LEN);
}

describe('buildIdnumber', () => {
  it('prefixes with "mcp:" and has total length 4 + 24', () => {
    const id = buildIdnumber('italiano-a1-2026-u3-c5', 'ejercicio-1');
    expect(id.startsWith(IDNUMBER_PREFIX)).toBe(true);
    expect(id.length).toBe(IDNUMBER_PREFIX.length + IDNUMBER_HASH_LEN);
  });

  it('tail is 24 lowercase hex chars', () => {
    const id = buildIdnumber('a', 'b');
    const tail = id.slice(IDNUMBER_PREFIX.length);
    expect(tail).toMatch(/^[0-9a-f]{24}$/);
  });

  it('is deterministic', () => {
    const id1 = buildIdnumber('ficha-1', 'comp-1');
    const id2 = buildIdnumber('ficha-1', 'comp-1');
    expect(id1).toBe(id2);
  });

  it('matches sha1(fichaId + "|" + componentId) truncated', () => {
    const id = buildIdnumber('ficha-1', 'comp-1');
    expect(id).toBe(IDNUMBER_PREFIX + expectedSha1Slice('ficha-1|comp-1'));
  });

  it('produces different ids for different component ids on same ficha', () => {
    const a = buildIdnumber('ficha-1', 'comp-1');
    const b = buildIdnumber('ficha-1', 'comp-2');
    expect(a).not.toBe(b);
  });

  it('produces different ids for different fichas on same component', () => {
    const a = buildIdnumber('ficha-1', 'comp-1');
    const b = buildIdnumber('ficha-2', 'comp-1');
    expect(a).not.toBe(b);
  });

  it('trims surrounding whitespace before hashing (avoids copy-paste drift)', () => {
    const clean = buildIdnumber('ficha-1', 'comp-1');
    const messy = buildIdnumber('  ficha-1 ', '\tcomp-1\n');
    expect(messy).toBe(clean);
  });

  it('throws on empty fichaId', () => {
    expect(() => buildIdnumber('', 'c')).toThrow(/fichaId/);
    expect(() => buildIdnumber('   ', 'c')).toThrow(/fichaId/);
  });

  it('throws on empty componentId', () => {
    expect(() => buildIdnumber('f', '')).toThrow(/componentId/);
    expect(() => buildIdnumber('f', '   ')).toThrow(/componentId/);
  });
});

describe('buildSectionIdnumber', () => {
  it('equals buildIdnumber(fichaId, "section")', () => {
    const fichaId = 'italiano-a1-2026-u3-c5';
    expect(buildSectionIdnumber(fichaId)).toBe(buildIdnumber(fichaId, 'section'));
  });

  it('matches the formula from CONTEXT §8.1', () => {
    const fichaId = 'ficha-x';
    expect(buildSectionIdnumber(fichaId)).toBe(
      IDNUMBER_PREFIX + expectedSha1Slice('ficha-x|section'),
    );
  });
});

describe('isMcpIdnumber', () => {
  it('accepts well-formed ids produced by buildIdnumber', () => {
    expect(isMcpIdnumber(buildIdnumber('f', 'c'))).toBe(true);
    expect(isMcpIdnumber(buildSectionIdnumber('f'))).toBe(true);
  });

  it('rejects other strings', () => {
    expect(isMcpIdnumber('mcp:short')).toBe(false);
    expect(isMcpIdnumber('mcp:' + 'g'.repeat(24))).toBe(false); // non-hex char
    expect(isMcpIdnumber('other:aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isMcpIdnumber('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isMcpIdnumber(null)).toBe(false);
    expect(isMcpIdnumber(undefined)).toBe(false);
    expect(isMcpIdnumber(42)).toBe(false);
    expect(isMcpIdnumber({})).toBe(false);
  });
});
