import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { DEVICE_TYPES, generateDeviceKey, hashDeviceKey } from "@/lib/biometric";
import { reprocessPunches } from "@/lib/biometric-process";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/devices
 *
 * Registered biometric / RFID attendance devices, with how recently each one
 * was heard from and how many punches are still unmatched to a person.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "school.settings");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const [devices, unmatched, recent] = await Promise.all([
    db.biometricDevice.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, serialNumber: true, deviceType: true,
        location: true, ipAddress: true, isActive: true, lastSeenAt: true,
        _count: { select: { punches: true } },
      },
    }),
    db.biometricPunch.count({ where: { studentId: null, staffId: null } }),
    db.biometricPunch.findMany({
      orderBy: { punchedAt: "desc" },
      take: 20,
      select: {
        id: true, punchedAt: true, direction: true, externalRef: true, processed: true,
        device: { select: { name: true } },
        student: { select: { firstName: true, lastName: true } },
        staff: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return cors(NextResponse.json({
    deviceTypes: DEVICE_TYPES,
    unmatched,
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      serialNumber: d.serialNumber,
      deviceType: d.deviceType,
      location: d.location,
      ipAddress: d.ipAddress,
      isActive: d.isActive,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      punches: d._count.punches,
    })),
    recent: recent.map((p) => ({
      id: p.id,
      at: p.punchedAt.toISOString(),
      direction: p.direction,
      device: p.device.name,
      person: p.student
        ? `${p.student.firstName} ${p.student.lastName ?? ""}`.trim()
        : p.staff
          ? `${p.staff.firstName} ${p.staff.lastName ?? ""}`.trim()
          : null,
      externalRef: p.externalRef,
      processed: p.processed,
    })),
  }));
}

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    name: z.string().trim().min(2, "A device name is required").max(80),
    serialNumber: z.string().trim().min(2, "A serial number is required").max(60),
    deviceType: z.enum(DEVICE_TYPES),
    location: z.string().trim().max(80).optional(),
    ipAddress: z.string().trim().max(45).optional(),
  }),
  z.object({ action: z.literal("regenerate"), deviceId: z.string().min(1) }),
  z.object({
    action: z.literal("status"),
    deviceId: z.string().min(1),
    isActive: z.boolean(),
  }),
  z.object({ action: z.literal("process") }),
]);

/**
 * POST /api/mobile/v1/admin/devices
 *
 * Register a device, re-issue its API key, switch it on or off, or re-run
 * matching for punches that never found a person. A device's API key is shown
 * exactly once — only its hash is stored, so it can be replaced but never read
 * back.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "school.settings");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }
  const db = scopedDb(session.schoolId);
  const body = parsed.data;

  if (body.action === "register") {
    const clash = await db.biometricDevice.findFirst({
      where: { serialNumber: body.serialNumber },
      select: { id: true },
    });
    if (clash) {
      return cors(NextResponse.json(
        { error: `A device with serial ${body.serialNumber} already exists.` },
        { status: 409 },
      ));
    }
    const key = generateDeviceKey();
    const device = await db.biometricDevice.create({
      data: {
        schoolId: session.schoolId,
        name: body.name,
        serialNumber: body.serialNumber,
        deviceType: body.deviceType,
        location: body.location || null,
        ipAddress: body.ipAddress || null,
        apiKeyHash: hashDeviceKey(key),
      },
      select: { id: true, name: true },
    });
    await recordAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: "biometric.device.register",
      entityType: "BiometricDevice",
      entityId: device.id,
      after: { name: device.name, serialNumber: body.serialNumber },
    });
    return cors(NextResponse.json({
      ok: true,
      apiKey: key,
      message: `${device.name} registered. Save its API key on the device now — it is shown only once.`,
    }));
  }

  if (body.action === "process") {
    const year = await db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const { scanned, resolved } = await reprocessPunches(
      db, session.schoolId, year?.id ?? null,
    );
    return cors(NextResponse.json({
      ok: true,
      message: scanned === 0
        ? "No unmatched punches to process."
        : `Processed ${resolved} of ${scanned} unmatched punch(es).`,
    }));
  }

  const device = await db.biometricDevice.findUnique({
    where: { id: body.deviceId },
    select: { id: true, name: true },
  });
  if (!device) {
    return cors(NextResponse.json({ error: "Device not found in your school." }, { status: 404 }));
  }

  if (body.action === "regenerate") {
    const key = generateDeviceKey();
    await db.biometricDevice.update({
      where: { id: device.id },
      data: { apiKeyHash: hashDeviceKey(key) },
    });
    await recordAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: "biometric.device.regenerate",
      entityType: "BiometricDevice",
      entityId: device.id,
    });
    return cors(NextResponse.json({
      ok: true,
      apiKey: key,
      message: `New API key for ${device.name}. The old one stopped working just now.`,
    }));
  }

  await db.biometricDevice.update({
    where: { id: device.id },
    data: { isActive: body.isActive },
  });
  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "biometric.device.status",
    entityType: "BiometricDevice",
    entityId: device.id,
    after: { isActive: body.isActive },
  });
  return cors(NextResponse.json({
    ok: true,
    message: `${device.name} ${body.isActive ? "activated" : "deactivated"}.`,
  }));
}
