/**
 * Transport rules — vehicle compliance and route capacity.
 *
 * Pure, so both the server pages and the tests share one definition of "this
 * bus is illegal to run tomorrow".
 */

export type ComplianceState = "VALID" | "EXPIRING" | "EXPIRED" | "UNKNOWN";

export interface ComplianceItem {
  key: "insurance" | "fitness" | "pollution";
  label: string;
  expiresAt: Date | null;
  state: ComplianceState;
  /** Negative once expired. */
  daysRemaining: number | null;
}

/** A certificate inside this window is flagged before it lapses. */
export const EXPIRY_WARNING_DAYS = 30;

function classify(
  expiresAt: Date | null | undefined,
  asOf: Date,
): { state: ComplianceState; daysRemaining: number | null } {
  if (!expiresAt) return { state: "UNKNOWN", daysRemaining: null };

  // Compare whole days so a certificate expiring later today is not already
  // "expired" at 09:00.
  const start = new Date(asOf);
  start.setHours(0, 0, 0, 0);
  const end = new Date(expiresAt);
  end.setHours(0, 0, 0, 0);

  const daysRemaining = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (daysRemaining < 0) return { state: "EXPIRED", daysRemaining };
  if (daysRemaining <= EXPIRY_WARNING_DAYS) return { state: "EXPIRING", daysRemaining };
  return { state: "VALID", daysRemaining };
}

export interface VehicleDocuments {
  insuranceExpiry?: Date | null;
  fitnessExpiry?: Date | null;
  pollutionExpiry?: Date | null;
}

/**
 * Compliance for one vehicle. A missing date is `UNKNOWN`, not valid — an
 * unrecorded certificate is a gap in the paperwork, and treating it as fine
 * would hide exactly the vehicles most likely to be uninsured.
 */
export function vehicleCompliance(
  vehicle: VehicleDocuments,
  asOf: Date = new Date(),
): ComplianceItem[] {
  return [
    { key: "insurance" as const, label: "Insurance", expiresAt: vehicle.insuranceExpiry ?? null },
    { key: "fitness" as const, label: "Fitness", expiresAt: vehicle.fitnessExpiry ?? null },
    { key: "pollution" as const, label: "Pollution", expiresAt: vehicle.pollutionExpiry ?? null },
  ].map((item) => ({ ...item, ...classify(item.expiresAt, asOf) }));
}

/** The most severe state across a vehicle's certificates. */
export function worstCompliance(items: readonly ComplianceItem[]): ComplianceState {
  if (items.some((item) => item.state === "EXPIRED")) return "EXPIRED";
  if (items.some((item) => item.state === "EXPIRING")) return "EXPIRING";
  if (items.some((item) => item.state === "UNKNOWN")) return "UNKNOWN";
  return "VALID";
}

export type OccupancyState = "EMPTY" | "HEALTHY" | "NEARLY_FULL" | "OVERLOADED";

export interface Occupancy {
  assigned: number;
  capacity: number;
  percent: number;
  seatsLeft: number;
  state: OccupancyState;
}

/**
 * Seat usage for a route.
 *
 * Overloading is reported rather than clamped: a bus carrying more children
 * than it has seats is the single most important thing this screen can say, so
 * the percentage is allowed to exceed 100.
 */
export function routeOccupancy(assigned: number, capacity: number): Occupancy {
  const safeCapacity = Math.max(0, capacity);
  const percent = safeCapacity > 0 ? (assigned / safeCapacity) * 100 : 0;

  let state: OccupancyState;
  if (safeCapacity > 0 && assigned > safeCapacity) state = "OVERLOADED";
  else if (assigned === 0) state = "EMPTY";
  else if (percent >= 90) state = "NEARLY_FULL";
  else state = "HEALTHY";

  return {
    assigned,
    capacity: safeCapacity,
    percent: Math.round(percent * 10) / 10,
    seatsLeft: Math.max(0, safeCapacity - assigned),
    state,
  };
}

export interface Ping {
  latitude: number | string | { toString(): string };
  longitude: number | string | { toString(): string };
  recordedAt: Date;
  speedKmph?: number | string | { toString(): string } | null;
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type TrackingState = "LIVE" | "RECENT" | "STALE" | "NO_SIGNAL";

/**
 * How much to trust the last known position.
 *
 * A tracker that stopped reporting twenty minutes ago must not be drawn as if
 * the bus were still there — parents watching for a child's bus need to know
 * the difference between "here" and "last seen here".
 */
export function trackingFreshness(
  lastPingAt: Date | null | undefined,
  asOf: Date = new Date(),
): { state: TrackingState; minutesAgo: number | null } {
  if (!lastPingAt) return { state: "NO_SIGNAL", minutesAgo: null };
  const minutesAgo = Math.max(
    0,
    Math.round((asOf.getTime() - lastPingAt.getTime()) / 60000),
  );
  if (minutesAgo <= 2) return { state: "LIVE", minutesAgo };
  if (minutesAgo <= 15) return { state: "RECENT", minutesAgo };
  return { state: "STALE", minutesAgo };
}
