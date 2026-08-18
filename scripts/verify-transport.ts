/**
 * Checks the transport rules in src/lib/transport.ts.
 *
 *   npx tsx scripts/verify-transport.ts
 *
 * These decide whether a bus is legal to run and whether it is overloaded, so
 * the boundaries — expiring today, expired yesterday, exactly at capacity —
 * are pinned down explicitly.
 */

import {
  EXPIRY_WARNING_DAYS,
  haversineKm,
  routeOccupancy,
  trackingFreshness,
  vehicleCompliance,
  worstCompliance,
} from "../src/lib/transport";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const NOW = new Date("2026-08-16T09:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86400000);

console.log("\n— vehicleCompliance —");
{
  const items = vehicleCompliance(
    {
      insuranceExpiry: days(200),
      fitnessExpiry: days(10),
      pollutionExpiry: days(-3),
    },
    NOW,
  );
  const byKey = Object.fromEntries(items.map((item) => [item.key, item]));

  check("a distant expiry is valid", byKey.insurance.state === "VALID", `${byKey.insurance.daysRemaining} days`);
  check(
    "an expiry inside the warning window is flagged",
    byKey.fitness.state === "EXPIRING",
    `${byKey.fitness.daysRemaining} days left`,
  );
  check("a past expiry is expired", byKey.pollution.state === "EXPIRED", `${byKey.pollution.daysRemaining} days`);
  check("days remaining goes negative once expired", byKey.pollution.daysRemaining === -3);
}

{
  // Boundaries: today, the last warning day, and the first day beyond it.
  const today = vehicleCompliance({ insuranceExpiry: days(0) }, NOW)[0];
  check("a certificate expiring today is not yet expired", today.state === "EXPIRING", "0 days left");

  const edge = vehicleCompliance({ insuranceExpiry: days(EXPIRY_WARNING_DAYS) }, NOW)[0];
  check(`exactly ${EXPIRY_WARNING_DAYS} days out still warns`, edge.state === "EXPIRING");

  const beyond = vehicleCompliance({ insuranceExpiry: days(EXPIRY_WARNING_DAYS + 1) }, NOW)[0];
  check(`${EXPIRY_WARNING_DAYS + 1} days out is valid`, beyond.state === "VALID");

  const yesterday = vehicleCompliance({ insuranceExpiry: days(-1) }, NOW)[0];
  check("expiring yesterday is expired", yesterday.state === "EXPIRED");

  // Same calendar day, earlier clock time — must not read as expired.
  const earlierToday = vehicleCompliance(
    { insuranceExpiry: new Date("2026-08-16T06:00:00Z") },
    NOW,
  )[0];
  check(
    "an expiry earlier the same day is not treated as lapsed",
    earlierToday.state === "EXPIRING",
    "compared by whole days, not by clock time",
  );
}

{
  const missing = vehicleCompliance({}, NOW);
  check(
    "a missing certificate date is UNKNOWN, never VALID",
    missing.every((item) => item.state === "UNKNOWN"),
    "an unrecorded certificate is a paperwork gap, not compliance",
  );
}

console.log("\n— worstCompliance —");
{
  check(
    "expired outranks expiring",
    worstCompliance(vehicleCompliance({ insuranceExpiry: days(-1), fitnessExpiry: days(5) }, NOW)) === "EXPIRED",
  );
  check(
    "expiring outranks unknown",
    worstCompliance(vehicleCompliance({ insuranceExpiry: days(5) }, NOW)) === "EXPIRING",
  );
  check(
    "all valid reports valid",
    worstCompliance(
      vehicleCompliance(
        { insuranceExpiry: days(100), fitnessExpiry: days(100), pollutionExpiry: days(100) },
        NOW,
      ),
    ) === "VALID",
  );
}

console.log("\n— routeOccupancy —");
{
  const empty = routeOccupancy(0, 45);
  check("an unused route is empty", empty.state === "EMPTY" && empty.seatsLeft === 45);

  const healthy = routeOccupancy(20, 45);
  check("a half-full route is healthy", healthy.state === "HEALTHY", `${healthy.percent}%`);

  const nearly = routeOccupancy(41, 45);
  check("90% or more is nearly full", nearly.state === "NEARLY_FULL", `${nearly.percent}%`);

  const exact = routeOccupancy(45, 45);
  check(
    "exactly at capacity is not overloaded",
    exact.state === "NEARLY_FULL" && exact.seatsLeft === 0,
    `${exact.percent}%`,
  );

  const over = routeOccupancy(50, 45);
  check("more children than seats is overloaded", over.state === "OVERLOADED");
  check(
    "overload percentage is reported above 100 rather than clamped",
    over.percent > 100,
    `${over.percent}%`,
  );
  check("seats left never goes negative", over.seatsLeft === 0);

  const noCapacity = routeOccupancy(5, 0);
  check("a vehicle with no recorded capacity does not divide by zero", noCapacity.percent === 0);
}

console.log("\n— haversineKm —");
{
  const zero = haversineKm({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 });
  check("the same point is zero distance", zero === 0);

  // Bengaluru to Mysuru is about 125 km as the crow flies.
  const blrToMysore = haversineKm({ lat: 12.9716, lng: 77.5946 }, { lat: 12.2958, lng: 76.6394 });
  check(
    "a known city pair lands in the right range",
    blrToMysore > 115 && blrToMysore < 135,
    `${blrToMysore.toFixed(1)} km`,
  );
}

console.log("\n— trackingFreshness —");
{
  const live = trackingFreshness(new Date(NOW.getTime() - 60_000), NOW);
  check("a ping a minute old is live", live.state === "LIVE", `${live.minutesAgo} min`);

  const recent = trackingFreshness(new Date(NOW.getTime() - 10 * 60_000), NOW);
  check("ten minutes old is recent", recent.state === "RECENT");

  const stale = trackingFreshness(new Date(NOW.getTime() - 40 * 60_000), NOW);
  check(
    "forty minutes old is stale",
    stale.state === "STALE",
    "a bus that stopped reporting must not be drawn as if it were there",
  );

  const none = trackingFreshness(null, NOW);
  check("no ping at all is no signal", none.state === "NO_SIGNAL" && none.minutesAgo === null);

  const future = trackingFreshness(new Date(NOW.getTime() + 60_000), NOW);
  check("a clock-skewed future ping does not go negative", future.minutesAgo === 0);
}

console.log(
  failures === 0
    ? "\nAll transport checks passed.\n"
    : `\n${failures} transport check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
