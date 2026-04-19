/**
 * Simple token-bucket rate limiter.
 *
 * Concurrent `acquire()` calls are serialised through an internal queue so
 * order is FIFO and no two callers race the same token. Clock and sleep
 * are injectable for deterministic tests.
 */

export interface RateLimiter {
  /** Resolves once the caller is allowed to proceed (1 token consumed). */
  acquire(): Promise<void>;
}

export interface TokenBucketOptions {
  /** Refill rate in tokens per second. Must be > 0. */
  tokensPerSec: number;
  /** Max bucket capacity (burst size). Defaults to `tokensPerSec` (1-second burst). */
  capacity?: number;
  /** Clock. Defaults to `Date.now`. */
  now?: () => number;
  /** Sleep function. Defaults to `setTimeout`-based wait. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function createTokenBucketLimiter(opts: TokenBucketOptions): RateLimiter {
  if (!(opts.tokensPerSec > 0)) {
    throw new Error('tokensPerSec must be a positive number');
  }
  const rate = opts.tokensPerSec;
  const capacity = opts.capacity ?? rate;
  if (!(capacity > 0)) {
    throw new Error('capacity must be a positive number');
  }
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;

  let tokens = capacity;
  let last = now();
  let queue: Promise<void> = Promise.resolve();

  const refill = (): void => {
    const t = now();
    const elapsed = Math.max(0, (t - last) / 1000);
    tokens = Math.min(capacity, tokens + elapsed * rate);
    last = t;
  };

  const tryTake = async (): Promise<void> => {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }
    const missing = 1 - tokens;
    const waitMs = Math.ceil((missing / rate) * 1000);
    await sleep(waitMs);
    refill();
    tokens -= 1;
  };

  return {
    acquire(): Promise<void> {
      const next = queue.then(() => tryTake());
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
