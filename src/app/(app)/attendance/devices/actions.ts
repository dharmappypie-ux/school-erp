"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { DEVICE_TYPES, generateDeviceKey, hashDeviceKey } from "@/lib/biometric";
import { reprocessPunches } from "@/lib/biometric-process";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const DeviceSchema = z.object({
  name: z.string().trim().min(2, "A device name is required").max(80),
  serialNumber: z.string().trim().min(2, "A serial number is required").max(60),
  deviceType: z.enum(DEVICE_TYPES),
  location: z.string().trim().max(80).optional(),
  ipAddress: z.string().trim().max(45).optional(),
});

/**
 * Registers a biometric device and returns its API key ONCE. The key is what
 * the device presents to the ingest endpoint; we store only its hash, so it can
 * never be shown again — only regenerated.
 */
export async function registerDevice(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = DeviceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("school.settings");
  const db = scopedDb(session.schoolId);

  const clash = await db.biometricDevice.findFirst({
    where: { serialNumber: parsed.data.serialNumber },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, message: `A device with serial ${parsed.data.serialNumber} already exists.`, values: raw };
  }

  const key = generateDeviceKey();
  const device = await db.biometricDevice.create({
    data: {
      schoolId: session.schoolId,
      name: parsed.data.name,
      serialNumber: parsed.data.serialNumber,
      deviceType: parsed.data.deviceType,
      location: parsed.data.location || null,
      ipAddress: parsed.data.ipAddress || null,
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
    after: { name: device.name, serialNumber: parsed.data.serialNumber },
  });

  revalidatePath("/attendance/devices");
  return {
    ok: true,
    message: `${device.name} registered. API key (shown once — save it on the device now): ${key}`,
  };
}

/** Issues a fresh API key for a device (the old one stops working immediately). */
export async function regenerateDeviceKey(deviceId: string): Promise<ActionResult> {
  const session = await requirePermission("school.settings");
  const db = scopedDb(session.schoolId);

  const device = await db.biometricDevice.findUnique({ where: { id: deviceId }, select: { id: true, name: true } });
  if (!device) return { ok: false, message: "Device not found in your school." };

  const key = generateDeviceKey();
  await db.biometricDevice.update({ where: { id: device.id }, data: { apiKeyHash: hashDeviceKey(key) } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "biometric.device.regenerate",
    entityType: "BiometricDevice",
    entityId: device.id,
  });

  revalidatePath("/attendance/devices");
  return { ok: true, message: `New API key for ${device.name} (shown once): ${key}` };
}

/** Activates or deactivates a device. A deactivated device's punches are rejected. */
export async function setDeviceActive(deviceId: string, active: boolean): Promise<ActionResult> {
  const session = await requirePermission("school.settings");
  const db = scopedDb(session.schoolId);

  const device = await db.biometricDevice.findUnique({ where: { id: deviceId }, select: { id: true, name: true } });
  if (!device) return { ok: false, message: "Device not found in your school." };

  await db.biometricDevice.update({ where: { id: device.id }, data: { isActive: active } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "biometric.device.status",
    entityType: "BiometricDevice",
    entityId: device.id,
    after: { isActive: active },
  });

  revalidatePath("/attendance/devices");
  return { ok: true, message: `${device.name} ${active ? "activated" : "deactivated"}.` };
}

/** Re-attempts matching for punches that never matched a person. */
export async function processPunchesNow(): Promise<ActionResult> {
  const session = await requirePermission("school.settings");
  const db = scopedDb(session.schoolId);
  const year = await db.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });

  const { scanned, resolved } = await reprocessPunches(db, session.schoolId, year?.id ?? null);

  revalidatePath("/attendance/devices");
  revalidatePath("/attendance");
  return {
    ok: true,
    message:
      scanned === 0
        ? "No unmatched punches to process."
        : `Processed ${resolved} of ${scanned} unmatched punch(es).`,
  };
}
