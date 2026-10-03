import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Biometric device API keys.
 *
 * A device authenticates to the punch-ingest endpoint with an API key. We store
 * only the SHA-256 of the key (`apiKeyHash`), never the key itself — the plain
 * key is shown once at registration, like a one-time password. SHA-256 (not
 * bcrypt) is the right tool here: the key is long and high-entropy, so there is
 * nothing to brute-force, and the ingest endpoint must verify it cheaply on
 * every punch.
 */

/** A fresh device key, shown once to the admin. */
export function generateDeviceKey(): string {
  return `bmk_${randomBytes(24).toString("base64url")}`;
}

/** The stored hash of a device key. */
export function hashDeviceKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Constant-time comparison of two hex digests (avoids timing leaks). */
export function deviceKeyMatches(key: string, storedHash: string): boolean {
  const a = Buffer.from(hashDeviceKey(key), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const DEVICE_TYPES = ["FINGERPRINT", "RFID", "FACE", "IRIS"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const PUNCH_DIRECTIONS = ["IN", "OUT"] as const;
export type PunchDirection = (typeof PUNCH_DIRECTIONS)[number];

/** Normalises a punch timestamp to the UTC calendar day used by attendance rows
 *  (AttendanceRecord.date is a @db.Date keyed per student per day). */
export function punchDay(punchedAt: Date): Date {
  return new Date(
    Date.UTC(punchedAt.getUTCFullYear(), punchedAt.getUTCMonth(), punchedAt.getUTCDate()),
  );
}
