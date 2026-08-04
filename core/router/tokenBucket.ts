/**
 * core/router/tokenBucket.ts — client-side rate limiting for the `nim`
 * provider (SPEC.md § 3: 30 rpm, below NIM's observed ~40 rpm ceiling).
 *
 * Non-blocking by design: `tryTake()` returns false instead of waiting.
 * Blocking would risk blowing a lane's latency budget (`converse` is
 * <1.5s and, per DECISIONS.md ADR-001, now shares this same bucket) —
 * better to fail fast and let the router fall through to the next
 * provider in the chain than to sit in a queue.
 */

export class TokenBucket {
  private readonly capacityPerMinute: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefill: number;

  constructor(capacityPerMinute: number, now: () => number = Date.now) {
    this.capacityPerMinute = capacityPerMinute;
    this.now = now;
    this.tokens = capacityPerMinute;
    this.lastRefill = now();
  }

  private refill(): void {
    const elapsedMs = this.now() - this.lastRefill;
    if (elapsedMs <= 0) return;
    const refilled = (elapsedMs / 60_000) * this.capacityPerMinute;
    this.tokens = Math.min(this.capacityPerMinute, this.tokens + refilled);
    this.lastRefill = this.now();
  }

  /** Returns true and consumes one token if available, false otherwise. */
  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
