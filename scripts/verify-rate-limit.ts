/**
 * Checks the token-bucket arithmetic in src/lib/rate-limit-core.ts.
 *
 *   npx tsx scripts/verify-rate-limit.ts
 *
 * A rate limiter fails in two directions and both are expensive: too loose and
 * it does not bound the bill it exists to bound; too tight and it locks out
 * legitimate users. The awkward cases — a clock stepping backwards, a denied
 * request draining the bucket it was denied by, a long idle period minting
 * unlimited credit — are pinned down here.
 */

import {
  describeWait,
  freshBucket,
  perHour,
  refill,
  retryAfter,
  tryConsume,
  type BucketConfig,
} from "../src/lib/rate-limit-core";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const at = (seconds: number) => new Date(1_000_000_000_000 + seconds * 1000);

console.log("\n— configuration —");
{
  const hourly = perHour(30, 5);
  check("burst is the capacity", hourly.capacity === 5);
  check(
    "refill rate is per second",
    Math.abs(hourly.refillPerSecond - 30 / 3600) < 1e-9,
    `${hourly.refillPerSecond.toFixed(6)}/s — one token every two minutes`,
  );

  const defaulted = perHour(10);
  check("burst defaults to the hourly count", defaulted.capacity === 10);
}

console.log("\n— spending —");
{
  const config: BucketConfig = { capacity: 3, refillPerSecond: 1 };
  let state = freshBucket(config, at(0));

  check("a fresh bucket starts full", state.tokens === 3);

  const first = tryConsume(state, config, at(0));
  check("the first request is allowed", first.allowed && first.tokens === 2);
  state = first.next;

  const second = tryConsume(state, config, at(0));
  state = second.next;
  const third = tryConsume(state, config, at(0));
  state = third.next;
  check("the burst is spent exactly", third.allowed && third.tokens === 0);

  const fourth = tryConsume(state, config, at(0));
  check("the next request is refused", !fourth.allowed);
  check(
    "a refusal reports when to come back",
    fourth.retryAfterSeconds === 1,
    `${fourth.retryAfterSeconds}s at one token per second`,
  );
}

console.log("\n— a refusal must not consume —");
{
  const config: BucketConfig = { capacity: 1, refillPerSecond: 0.1 };
  let state = { tokens: 0.5, updatedAt: at(0) };

  // Hammering a limiter must not push recovery further away each time.
  let everyAttemptRefused = true;
  for (let i = 0; i < 20; i += 1) {
    const denied = tryConsume(state, config, at(0));
    if (denied.allowed) everyAttemptRefused = false;
    state = denied.next;
  }
  check("a balance below one token is refused every time", everyAttemptRefused);

  check(
    "twenty refusals leave the balance untouched",
    Math.abs(state.tokens - 0.5) < 1e-9,
    `${state.tokens} tokens — a caller hammering the endpoint cannot lock themselves out further`,
  );

  const recovered = tryConsume(state, config, at(5));
  check("it recovers on schedule", recovered.allowed, "0.5 + 5×0.1 = 1.0");
}

console.log("\n— refill —");
{
  const config: BucketConfig = { capacity: 10, refillPerSecond: 1 };

  check(
    "tokens accrue with elapsed time",
    refill({ tokens: 2, updatedAt: at(0) }, config, at(3)) === 5,
  );
  check(
    "refill is capped at capacity",
    refill({ tokens: 2, updatedAt: at(0) }, config, at(100_000)) === 10,
    "a bucket idle overnight does not mint unlimited credit",
  );
  check(
    "an unused bucket stays at capacity",
    refill({ tokens: 10, updatedAt: at(0) }, config, at(50)) === 10,
  );
}

console.log("\n— clocks that misbehave —");
{
  const config: BucketConfig = { capacity: 5, refillPerSecond: 1 };

  // NTP correction, a restored snapshot, or two app servers disagreeing.
  const backwards = refill({ tokens: 3, updatedAt: at(100) }, config, at(40));
  check(
    "a backwards clock does not remove tokens",
    backwards === 3,
    "otherwise a clock correction locks users out for no reason",
  );

  const stillWorks = tryConsume({ tokens: 3, updatedAt: at(100) }, config, at(40));
  check("and the request still succeeds", stillWorks.allowed && stillWorks.tokens === 2);
}

console.log("\n— misconfiguration fails closed —");
{
  const zeroCapacity = tryConsume(
    { tokens: 0, updatedAt: at(0) },
    { capacity: 0, refillPerSecond: 1 },
    at(0),
  );
  check(
    "a zero-capacity bucket refuses",
    !zeroCapacity.allowed,
    "a limiter misconfigured to zero must not read as unlimited",
  );

  const zeroRefill = tryConsume(
    { tokens: 0, updatedAt: at(0) },
    { capacity: 5, refillPerSecond: 0 },
    at(0),
  );
  check("a bucket that never refills refuses", !zeroRefill.allowed);

  const negative = tryConsume(
    { tokens: 1, updatedAt: at(0) },
    { capacity: -1, refillPerSecond: -1 },
    at(0),
  );
  check("negative configuration refuses", !negative.allowed);
}

console.log("\n— retry-after —");
{
  const config: BucketConfig = { capacity: 5, refillPerSecond: 0.5 };
  check("an empty bucket waits for a whole token", retryAfter(0, config) === 2);
  check("a partial balance waits proportionally", retryAfter(0.5, config) === 1);
  check(
    "the wait is never reported as zero",
    retryAfter(0.999, config) >= 1,
    "'try again in 0 seconds' would just fail again",
  );

  const slow = perHour(30, 5);
  check(
    "a slow bucket reports a realistic wait",
    retryAfter(0, slow) === 120,
    "30/hour means one token every two minutes",
  );
}

console.log("\n— wording —");
{
  check("seconds read as seconds", describeWait(30) === "30 seconds");
  check("one second is singular", describeWait(1) === "1 second");
  check("a minute reads as minutes", describeWait(120) === "2 minutes");
  check("partial minutes round up", describeWait(90) === "2 minutes");
  check("long waits read as hours", describeWait(7200) === "2 hours");
}

console.log("\n— sustained rate —");
{
  // Over a long run the bucket must converge on the configured rate, not the
  // burst: the burst is a courtesy, the rate is the actual bound.
  const config = perHour(30, 5);
  let state = freshBucket(config, at(0));
  let allowed = 0;

  for (let second = 0; second <= 3600; second += 10) {
    const result = tryConsume(state, config, at(second));
    if (result.allowed) allowed += 1;
    state = result.next;
  }

  check(
    "an hour of constant pressure yields about the hourly rate",
    allowed >= 30 && allowed <= 36,
    `${allowed} allowed against a 30/hour limit plus a burst of 5`,
  );
}

console.log(
  failures === 0
    ? "\nAll rate limit checks passed.\n"
    : `\n${failures} rate limit check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
