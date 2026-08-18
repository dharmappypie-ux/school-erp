/**
 * Token-bucket rate limiting — the arithmetic, with no database in sight.
 *
 * A bucket holds up to `capacity` tokens and refills at `refillPerSecond`.
 * Each request spends one. This shape is chosen over a fixed window because a
 * fixed window lets someone spend the whole allowance in the last second of one
 * window and the whole of the next in the first second — twice the intended
 * rate, at the moment it costs most. A bucket permits a small burst and then
 * paces strictly.
 *
 * Kept pure so the behaviour that actually runs is the behaviour under test;
 * see rate-limit.ts for the row locking that makes it safe under concurrency.
 */

export interface BucketConfig {
  /** Maximum tokens held — the largest burst permitted. */
  capacity: number;
  /** Tokens added per second of elapsed time. */
  refillPerSecond: number;
}

export interface BucketState {
  tokens: number;
  updatedAt: Date;
}

export interface ConsumeResult {
  allowed: boolean;
  /** Tokens remaining after this attempt. */
  tokens: number;
  /** Whole seconds until the next token is available; 0 when allowed. */
  retryAfterSeconds: number;
}

/** A bucket that has never been used starts full. */
export function freshBucket(config: BucketConfig, now: Date): BucketState {
  return { tokens: config.capacity, updatedAt: now };
}

/**
 * Tokens available at `now`, given the last recorded state.
 *
 * Elapsed time is floored at zero. A clock that steps backwards — NTP
 * correction, a restored database snapshot, two app servers disagreeing —
 * would otherwise subtract tokens and lock a caller out for no reason.
 */
export function refill(
  state: BucketState,
  config: BucketConfig,
  now: Date,
): number {
  const elapsedSeconds = Math.max(
    0,
    (now.getTime() - state.updatedAt.getTime()) / 1000,
  );
  const gained = elapsedSeconds * config.refillPerSecond;
  return Math.min(config.capacity, state.tokens + gained);
}

/**
 * Attempts to spend one token.
 *
 * On refusal the state is returned unchanged — a denied request must not
 * consume anything, or a caller hammering the endpoint would hold their own
 * bucket permanently empty and never recover.
 */
export function tryConsume(
  state: BucketState,
  config: BucketConfig,
  now: Date,
): ConsumeResult & { next: BucketState } {
  if (config.capacity <= 0 || config.refillPerSecond <= 0) {
    // A misconfigured bucket refuses rather than silently allowing everything.
    return {
      allowed: false,
      tokens: 0,
      retryAfterSeconds: 0,
      next: state,
    };
  }

  const available = refill(state, config, now);

  if (available < 1) {
    return {
      allowed: false,
      tokens: available,
      retryAfterSeconds: retryAfter(available, config),
      // updatedAt advances so the refill already credited is not recomputed,
      // but the token count is untouched.
      next: { tokens: available, updatedAt: now },
    };
  }

  return {
    allowed: true,
    tokens: available - 1,
    retryAfterSeconds: 0,
    next: { tokens: available - 1, updatedAt: now },
  };
}

/** Whole seconds until the bucket holds one token. Always at least 1. */
export function retryAfter(tokens: number, config: BucketConfig): number {
  if (config.refillPerSecond <= 0) return 0;
  const needed = Math.max(0, 1 - tokens);
  return Math.max(1, Math.ceil(needed / config.refillPerSecond));
}

/** Builds a config from a human-friendly "N per hour, burst B". */
export function perHour(count: number, burst = count): BucketConfig {
  return { capacity: burst, refillPerSecond: count / 3600 };
}

/** Renders a wait in words, for a message shown to a person. */
export function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
