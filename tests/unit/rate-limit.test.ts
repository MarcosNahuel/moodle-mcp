import { describe, it, expect } from 'vitest';
import { createTokenBucketLimiter } from '../../src/utils/rate-limit.js';

/**
 * Build a limiter driven by a fake clock. `sleep(ms)` advances the clock and
 * resolves immediately, so tests finish in microseconds while asserting the
 * *logical* time that passed.
 */
function makeFakeLimiter(tokensPerSec: number, capacity?: number) {
  const clock = { t: 0 };
  const slept: number[] = [];
  const limiter = createTokenBucketLimiter({
    tokensPerSec,
    ...(capacity !== undefined ? { capacity } : {}),
    now: () => clock.t,
    sleep: async (ms) => {
      slept.push(ms);
      clock.t += ms;
    },
  });
  return { limiter, clock, slept };
}

describe('createTokenBucketLimiter', () => {
  it('throws on non-positive rate', () => {
    expect(() => createTokenBucketLimiter({ tokensPerSec: 0 })).toThrow();
    expect(() => createTokenBucketLimiter({ tokensPerSec: -1 })).toThrow();
  });

  it('throws on non-positive capacity', () => {
    expect(() =>
      createTokenBucketLimiter({ tokensPerSec: 10, capacity: 0 }),
    ).toThrow();
  });

  it('lets initial burst through without sleeping', async () => {
    const { limiter, slept } = makeFakeLimiter(10); // capacity defaults to 10
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }
    expect(slept).toEqual([]);
  });

  it('forces a wait after burst is exhausted', async () => {
    const { limiter, slept } = makeFakeLimiter(10);
    for (let i = 0; i < 10; i++) await limiter.acquire();
    await limiter.acquire(); // 11th — bucket empty, must wait ~100ms
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThanOrEqual(100);
    expect(slept[0]).toBeLessThanOrEqual(101);
  });

  it('refills smoothly over time', async () => {
    const { limiter, clock, slept } = makeFakeLimiter(10);
    // burn the burst
    for (let i = 0; i < 10; i++) await limiter.acquire();
    // advance 500ms → 5 fresh tokens
    clock.t += 500;
    for (let i = 0; i < 5; i++) await limiter.acquire();
    // still no sleep yet, we only consumed refilled tokens
    expect(slept).toEqual([]);
    // 6th should sleep roughly 100ms
    await limiter.acquire();
    expect(slept).toHaveLength(1);
  });

  it('caps tokens at capacity (no infinite storage)', async () => {
    const { limiter, clock, slept } = makeFakeLimiter(10, 10);
    // idle for 10 seconds → would refill 100 tokens if uncapped
    clock.t += 10_000;
    // but capacity is 10, so only 10 acquires should be free
    for (let i = 0; i < 10; i++) await limiter.acquire();
    expect(slept).toEqual([]);
    // 11th must sleep
    await limiter.acquire();
    expect(slept).toHaveLength(1);
  });

  it('serialises concurrent acquires FIFO', async () => {
    const { limiter, slept } = makeFakeLimiter(10, 10);
    const order: number[] = [];
    const ps = Array.from({ length: 15 }, (_, i) =>
      limiter.acquire().then(() => {
        order.push(i);
      }),
    );
    await Promise.all(ps);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    // first 10 free, remaining 5 each sleep once
    expect(slept).toHaveLength(5);
    for (const ms of slept) {
      expect(ms).toBeGreaterThanOrEqual(100);
    }
  });

  it('uses custom capacity as burst size', async () => {
    const { limiter, slept } = makeFakeLimiter(10, 3);
    for (let i = 0; i < 3; i++) await limiter.acquire();
    expect(slept).toEqual([]);
    await limiter.acquire();
    expect(slept).toHaveLength(1);
  });
});
