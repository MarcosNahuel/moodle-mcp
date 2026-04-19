import { describe, it, expect } from 'vitest';
import {
  createLogger,
  deepRedact,
  nullLogger,
} from '../../src/utils/logger.js';

function makeCaptured(opts: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const lines: string[] = [];
  const logger = createLogger({
    clock: () => '2026-04-18T00:00:00.000Z',
    sink: (l) => lines.push(l),
    ...opts,
  });
  const records = (): Array<Record<string, unknown>> =>
    lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { logger, lines, records };
}

describe('createLogger', () => {
  it('writes a single JSON-per-line with ts/level/msg', () => {
    const { logger, lines, records } = makeCaptured();
    logger.info('hello');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.includes('\n')).toBe(false);
    expect(records()[0]).toMatchObject({
      ts: '2026-04-18T00:00:00.000Z',
      level: 'info',
      msg: 'hello',
    });
  });

  it('merges extra fields', () => {
    const { logger, records } = makeCaptured();
    logger.info('event', { tool: 'publicar_ficha_clase', ficha_id: 'f1' });
    expect(records()[0]).toMatchObject({
      level: 'info',
      msg: 'event',
      tool: 'publicar_ficha_clase',
      ficha_id: 'f1',
    });
  });

  it('silences messages below threshold', () => {
    const { logger, lines } = makeCaptured({ level: 'warn' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).level).toBe('warn');
    expect(JSON.parse(lines[1]!).level).toBe('error');
  });

  it('default level is info (debug suppressed)', () => {
    const { logger, lines } = makeCaptured();
    logger.debug('d');
    logger.info('i');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).level).toBe('info');
  });

  it('lets debug through when level is debug', () => {
    const { logger, lines } = makeCaptured({ level: 'debug' });
    logger.debug('x');
    expect(lines).toHaveLength(1);
  });

  it('rejects invalid level at construction', () => {
    expect(() =>
      createLogger({ level: 'trace' as never }),
    ).toThrow(/log level/i);
  });

  it('redacts configured secrets in msg and fields', () => {
    const TOKEN = 'SECRET-123';
    const { logger, records } = makeCaptured({ redact: [TOKEN] });
    logger.error(`failed with token ${TOKEN}`, {
      url: `https://x/?wstoken=${TOKEN}`,
      nested: { inner: TOKEN },
    });
    const r = records()[0] as {
      msg: string;
      url: string;
      nested: { inner: string };
    };
    expect(r.msg).not.toContain(TOKEN);
    expect(r.msg).toContain('***');
    expect(r.url).not.toContain(TOKEN);
    expect(r.nested.inner).toBe('***');
  });

  it('escapes regex metachars in redact targets', () => {
    const tok = 'a.b+c';
    const { logger, records } = makeCaptured({ redact: [tok] });
    logger.info(`leak ${tok}`);
    expect((records()[0] as { msg: string }).msg).toBe('leak ***');
  });

  it('child logger merges base fields into every call', () => {
    const { logger, records } = makeCaptured();
    const c = logger.child({ tool: 'publicar_ficha_clase', ficha_id: 'f1' });
    c.info('start');
    c.warn('slow', { duration_ms: 1200 });
    const rs = records();
    expect(rs[0]).toMatchObject({
      tool: 'publicar_ficha_clase',
      ficha_id: 'f1',
      msg: 'start',
    });
    expect(rs[1]).toMatchObject({
      tool: 'publicar_ficha_clase',
      ficha_id: 'f1',
      duration_ms: 1200,
      level: 'warn',
    });
  });

  it('child of child accumulates', () => {
    const { logger, records } = makeCaptured();
    const c = logger.child({ tool: 't' });
    const gc = c.child({ ficha_id: 'f' });
    gc.info('x');
    expect(records()[0]).toMatchObject({ tool: 't', ficha_id: 'f', msg: 'x' });
  });

  it('handles circular references without throwing', () => {
    const { logger, lines } = makeCaptured();
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    logger.info('circ', { obj });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[Circular]');
  });

  it('call-site fields override base fields', () => {
    const { logger, records } = makeCaptured();
    const c = logger.child({ tool: 'base' });
    c.info('x', { tool: 'override' });
    expect(records()[0]!.tool).toBe('override');
  });
});

describe('deepRedact', () => {
  it('returns input unchanged when no secrets', () => {
    expect(deepRedact({ a: 'x' }, [])).toEqual({ a: 'x' });
    expect(deepRedact('x', [''])).toBe('x');
  });

  it('walks arrays', () => {
    expect(deepRedact(['a TOK', 'no'], ['TOK'])).toEqual(['a ***', 'no']);
  });

  it('breaks cycles with [Circular]', () => {
    const a: Record<string, unknown> = { x: 'TOK' };
    a.self = a;
    const out = deepRedact(a, ['TOK']) as Record<string, unknown>;
    expect(out.x).toBe('***');
    expect(out.self).toBe('[Circular]');
  });
});

describe('nullLogger', () => {
  it('is a no-op and supports child()', () => {
    expect(() => {
      nullLogger.error('x');
      nullLogger.warn('x');
      nullLogger.info('x');
      nullLogger.debug('x');
      nullLogger.child({ k: 'v' }).info('y');
    }).not.toThrow();
  });
});
