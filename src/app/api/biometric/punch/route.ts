import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { deviceKeyMatches } from "@/lib/biometric";
import { applyPunch, type PunchInput } from "@/lib/biometric-process";
import { scopedDb } from "@/lib/tenant";

/**
 * Biometric punch ingest.
 *
 * A physical reader (fingerprint/RFID/face/iris) POSTs punches here. It
 * authenticates with its serial number + API key (the key issued once at
 * registration; we store only its SHA-256). Each punch is matched to a student
 * by admission number — or staff by employee id — and a student's punch becomes
 * today's attendance (PRESENT, source BIOMETRIC).
 *
 * Example:
 *   POST /api/biometric/punch
 *   { "serialNumber": "ZK-1023", "key": "bmk_…",
 *     "punches": [ { "externalRef": "GIS20260001", "punchedAt": "2026-10-03T08:55:00Z", "direction": "IN" } ] }
 */

const PunchSchema = z.object({
  externalRef: z.string().trim().min(1),
  punchedAt: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? new Date(v) : new Date()))
    .refine((d) => !Number.isNaN(d.getTime()), { message: "Invalid punchedAt" }),
  direction: z.enum(["IN", "OUT"]).default("IN"),
  rawPayload: z.unknown().optional(),
});

const BodySchema = z
  .object({
    serialNumber: z.string().trim().min(1, "serialNumber is required"),
    key: z.string().trim().optional(),
    punches: z.array(PunchSchema).max(500).optional(),
    // Convenience: a single punch at the top level.
    externalRef: z.string().trim().optional(),
    punchedAt: z.string().optional(),
    direction: z.enum(["IN", "OUT"]).optional(),
  });

function unauthorized() {
  // One generic message so a caller can't probe valid serials or keys.
  return NextResponse.json({ ok: false, error: "Invalid device credentials" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const headerKey = request.headers.get("x-device-key")?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : undefined;
  const key = headerKey || bearer || parsed.data.key;
  if (!key) return unauthorized();

  // Serial numbers are unique only within a school, so there can be more than
  // one device with the same serial across tenants — the key is what actually
  // authenticates. Find the active device whose stored hash matches the key.
  const candidates = await prisma.biometricDevice.findMany({
    where: { serialNumber: parsed.data.serialNumber, isActive: true },
    select: { id: true, schoolId: true, apiKeyHash: true },
  });
  const device = candidates.find((d) => deviceKeyMatches(key, d.apiKeyHash));
  if (!device) return unauthorized();

  // Assemble the punch list (array form, or a single top-level punch).
  const list: PunchInput[] =
    parsed.data.punches && parsed.data.punches.length > 0
      ? parsed.data.punches
      : parsed.data.externalRef
        ? [
            PunchSchema.parse({
              externalRef: parsed.data.externalRef,
              punchedAt: parsed.data.punchedAt,
              direction: parsed.data.direction,
            }),
          ]
        : [];

  if (list.length === 0) {
    return NextResponse.json({ ok: false, error: "No punches supplied" }, { status: 400 });
  }

  const db = scopedDb(device.schoolId);
  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  const results = [];
  for (const punch of list) {
    try {
      results.push(
        await applyPunch(db, {
          schoolId: device.schoolId,
          deviceId: device.id,
          currentYearId: year?.id ?? null,
          punch,
        }),
      );
    } catch (error) {
      results.push({
        externalRef: punch.externalRef,
        matched: false,
        kind: "none" as const,
        attendanceMarked: false,
        error: error instanceof Error ? error.message : "processing failed",
      });
    }
  }

  // tenant-safe: scoped to the authenticated device's school.
  await db.biometricDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  const matched = results.filter((r) => r.matched).length;
  const attendance = results.filter((r) => r.attendanceMarked).length;
  return NextResponse.json({
    ok: true,
    received: list.length,
    matched,
    attendanceMarked: attendance,
    unmatched: results.filter((r) => !r.matched).map((r) => r.externalRef),
  });
}
