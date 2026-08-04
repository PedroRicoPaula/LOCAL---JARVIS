/**
 * core/router/concurrencyLimiter.ts — caps requests *in flight* at once,
 * independent of `TokenBucket`'s requests-*per-minute* limit.
 *
 * Found the gap live during Phase 3: NIM returned "ResourceExhausted:
 * Worker local total request limit reached (19/16)" — a concurrency
 * ceiling, not a rate one. `TokenBucket` alone doesn't prevent this; a
 * burst of calls started in quick succession (rapid benchmark iteration,
 * or — looking ahead — several skills firing near-simultaneously) can all
 * pass the per-minute check while still exceeding how many the account
 * allows *at the same instant*. Non-blocking by the same reasoning as
 * `TokenBucket`: refuse and let `router.ts` fall through rather than queue
 * and risk a lane's latency budget.
 */

export class ConcurrencyLimiter {
  private readonly max: number;
  private inFlight = 0;

  constructor(max: number) {
    this.max = max;
  }

  tryAcquire(): boolean {
    if (this.inFlight >= this.max) return false;
    this.inFlight += 1;
    return true;
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }
}
