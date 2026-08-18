import "server-only";

import { prisma } from "@/lib/db";
import {
  describeWait,
  freshBucket,
  perHour,
  tryConsume,
  type BucketConfig,
  type BucketState,
} from "@/lib/rate-limit-core";

/**
 * Durable rate limiting, backed by Postgres.
 *
 * An in-memory counter would be simpler and faster, and wrong the moment the
 * app runs as more than one process: each instance would grant the full
 * allowance, and a restart would clear every bucket. Since the limit here
 * exists to bound real spend on the Claude API, it has to survive both.
 *
 * Each check runs inside a transaction that takes a row lock, so two
 * simultaneous requests cannot both read the same token count and both spend
 * it. The arithmetic itself lives in rate-limit-core.ts and is what runs — the
 * lock provides isolation, not a second implementation.
 */

export interface LimitDecision {
  allowed: boolean;
  /** Which named limit refused, when one did. */
  limitedBy?: string;
  retryAfterSeconds: number;
  /** A sentence suitable for showing to the person who was refused. */
  message?: string;
  /** Tokens left on the tightest bucket, for a remaining-quota display. */
  remaining: number;
}

export interface NamedLimit {
  /** Stable identifier for the bucket row, e.g. `ask:user:abc123`. */
  key: string;
  /** Human label used in the refusal message. */
  label: string;
  config: BucketConfig;
}

/**
 * The limits applied to natural-language querying.
 *
 * Two buckets, because they guard different things. The per-user bucket stops
 * one person looping on the endpoint; the per-school bucket stops a whole
 * school's users collectively running up a bill that no single user's limit
 * would catch. A tenant that adds fifty accounts should not get fifty times
 * the spend.
 */
export function askLimits(schoolId: string, userId: string): NamedLimit[] {
  return [
    {
      key: `ask:user:${userId}`,
      label: "your questions",
      // Enough for sustained real use; a burst of 5 covers rapid follow-ups.
      config: perHour(30, 5),
    },
    {
      key: `ask:school:${schoolId}`,
      label: "your school's questions",
      config: perHour(300, 40),
    },
  ];
}

interface RateLimitRow {
  tokens: number;
  updated_at: Date;
}

/**
 * Spends one token against every listed limit, or none at all.
 *
 * All-or-nothing matters: if the user bucket allowed the request but the school
 * bucket refused it, the user's token must not be consumed. Otherwise a
 * school-wide block would silently drain every individual allowance too. The
 * whole check runs in one transaction so a refusal rolls back cleanly.
 */
export async function consumeAll(
  limits: readonly NamedLimit[],
  now: Date = new Date(),
): Promise<LimitDecision> {
  if (limits.length === 0) {
    return { allowed: true, retryAfterSeconds: 0, remaining: Infinity };
  }

  // Locking in a stable order avoids a deadlock when two requests touch the
  // same pair of buckets from opposite directions.
  const ordered = [...limits].sort((a, b) => a.key.localeCompare(b.key));

  return prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    let remaining = Infinity;
    const updates: { key: string; state: BucketState }[] = [];

    for (const limit of ordered) {
      // tenant-safe: rate_limits is infrastructure with no tenant column; the
      // key embeds the school and user it belongs to.
      const rows = await tx.$queryRaw<RateLimitRow[]>`
        SELECT tokens, updated_at FROM rate_limits WHERE key = ${limit.key} FOR UPDATE
      `;

      const state: BucketState = rows[0]
        ? { tokens: Number(rows[0].tokens), updatedAt: rows[0].updated_at }
        : freshBucket(limit.config, now);

      const result = tryConsume(state, limit.config, now);

      if (!result.allowed) {
        // Nothing has been written yet, so returning here leaves every bucket
        // — including ones already checked — untouched.
        return {
          allowed: false,
          limitedBy: limit.label,
          retryAfterSeconds: result.retryAfterSeconds,
          remaining: Math.floor(Math.max(0, result.tokens)),
          message: `Rate limit reached on ${limit.label}. Try again in ${describeWait(
            result.retryAfterSeconds,
          )}.`,
        };
      }

      remaining = Math.min(remaining, result.tokens);
      updates.push({ key: limit.key, state: result.next });
    }

    for (const update of updates) {
      // tenant-safe: see above — the key carries the tenant.
      await tx.$executeRaw`
        INSERT INTO rate_limits (key, tokens, updated_at)
        VALUES (${update.key}, ${update.state.tokens}, ${update.state.updatedAt})
        ON CONFLICT (key) DO UPDATE
          SET tokens = ${update.state.tokens}, updated_at = ${update.state.updatedAt}
      `;
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.floor(Math.max(0, remaining)),
    };
  });
}

/** Reads remaining quota without spending anything. */
export async function peek(
  limits: readonly NamedLimit[],
  now: Date = new Date(),
): Promise<number> {
  let remaining = Infinity;

  for (const limit of limits) {
    // tenant-safe: the key embeds the school and user.
    const rows = await prisma.$queryRaw<RateLimitRow[]>`
      SELECT tokens, updated_at FROM rate_limits WHERE key = ${limit.key}
    `;
    const state: BucketState = rows[0]
      ? { tokens: Number(rows[0].tokens), updatedAt: rows[0].updated_at }
      : freshBucket(limit.config, now);

    const result = tryConsume(state, limit.config, now);
    remaining = Math.min(remaining, Math.max(0, result.allowed ? result.tokens + 1 : 0));
  }

  return Math.floor(remaining);
}
